import {Command, Flags} from '@oclif/core'
import Web3 from 'web3'
import {contractFlags, intervalFlags, rpcFlags} from '../utils/flags'
import * as fs from 'node:fs'
import {AsyncBatchRequest, getBlockNumberBatches} from '../utils/batch'
import Heap from 'heap-js'
import pLimit from 'p-limit'

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

type GetterResult = [number, any[]]

export default class Getters extends Command {
  static description = 'describe the command here'

  static flags = {
    ...intervalFlags,
    ...rpcFlags,
    ...contractFlags,
    batchSize: Flags.integer({default: 10}),
    concurrency: Flags.integer({default: 100}),
    getter: Flags.string({char: 'g', required: true}), // multicall
  }

  public async run(): Promise<void> {
    console.log('THIS IS A TEST\n\n\n')

    const {flags} = await this.parse(Getters)

    const web3 = new Web3(flags.rpc)

    const abi = JSON.parse(
      flags.abiFile ? fs.readFileSync(flags.abiFile, 'utf-8') : flags.abi!,
    )

    const contract = new web3.eth.Contract(abi, flags.address)

    const endBlock =
      flags.endBlock ?? (await web3.eth.getBlockNumber()) - flags.confirmations

    const blockNumberBatches = getBlockNumberBatches(
      flags.startBlock,
      endBlock,
      flags.batchSize,
    )

    // const concurrencyLimit = pLimit(flags.concurrency)

    const batchPromises: Promise<unknown>[] = []

    // TODO: figure out multicall

    const minHeap = new Heap<GetterResult>()

    let lastEmittedBlock = flags.startBlock - 1

    batchPromises.push(
      ...blockNumberBatches.map(async blockNumbers => {
        const batch = new AsyncBatchRequest(web3)
        for (const block of blockNumbers) {
          batch.add(contract.methods[flags.getter]().call, block)
        }

        try {
          const results = (await batch.execute()) as [number, any][]

          const data = results.map(
            ([blockNumber, result]) =>
              [blockNumber, callResultToArray(result)] as GetterResult,
          )
          minHeap.push(...data)
          // only keep batches in promises
          while (minHeap.peek()?.[0] == lastEmittedBlock + 1) {
            // TODO: should it emit the full record or not?
            console.log(JSON.stringify(minHeap.pop()))
            lastEmittedBlock++
          }
        } catch (error) {
          console.error(error)
          console.log('OOPS THERE WAS AN ERROR')
        }
      }),
    )

    await Promise.all(batchPromises)
  }
}
