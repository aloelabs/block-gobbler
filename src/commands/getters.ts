import {Command, Flags} from '@oclif/core'
import Web3 from 'web3'
import {contractFlags, intervalFlags, rpcFlags} from '../utils/flags'
import * as fs from 'node:fs'
import Heap from 'heap-js'

type GetterResult = [number, any[]]

async function sleep(millis: number) {
  return new Promise((resolve, _) => {
    setTimeout(resolve, millis)
  })
}

const callResultToArray = (result: any) => {
  let resultArray
  if (typeof result === 'object') {
    resultArray = []
    for (let i = 0; i.toString() in result; i++) {
      resultArray.push(result[i.toString()])
    }
  } else {
    resultArray = [result]
  }

  return resultArray
}

export default class Getters extends Command {
  static description = 'describe the command here'

  static flags = {
    ...intervalFlags,
    ...rpcFlags,
    ...contractFlags,
    maxAttempts: Flags.integer({default: 3}),
    maxTimeout: Flags.integer({default: 10_000}), // millis
    baseBackoffInterval: Flags.integer({default: 500}), // millis
    requestsPerSecond: Flags.integer({default: 100}),
    getter: Flags.string({char: 'g', required: true}), // multicall
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Getters)

    const web3 = new Web3(flags.rpc)

    const abi = JSON.parse(
      flags.abiFile ? fs.readFileSync(flags.abiFile, 'utf-8') : flags.abi!,
    )

    const contract = new web3.eth.Contract(abi, flags.address)

    const endBlock =
      flags.endBlock ?? (await web3.eth.getBlockNumber()) - flags.confirmations

    const maxAttempts = flags.maxAttempts
    const maxTimeout = flags.maxTimeout
    const baseBackoffInterval = flags.baseBackoffInterval
    const nominalRPS = flags.requestsPerSecond

    const promises: Promise<unknown>[] = []

    const minHeap = new Heap<GetterResult>()
    let lastEmittedBlock = flags.startBlock - 1

    for (let block = flags.startBlock; block < endBlock; block += 1) {
      const fetch = async () => {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const res = await contract.methods[flags.getter]().call(block)
            const resWithMetadata = [block, callResultToArray(res)] as GetterResult

            minHeap.push(resWithMetadata)
            while (minHeap.peek()?.[0] === lastEmittedBlock + 1) {
              console.log(JSON.stringify(minHeap.pop()))
              lastEmittedBlock++
            }

            break
          } catch {
            const backoff = Math.min(baseBackoffInterval * (2 ** attempt), maxTimeout)
            const jitter = backoff * 0.2 * (Math.random() - 0.5)
            // eslint-disable-next-line no-await-in-loop
            await sleep(backoff + jitter)
          }
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(1000 / nominalRPS)

      promises.push(fetch())
    }

    await Promise.all(promises)
  }
}
