import {BatchRequest} from 'web3-core/types'
import Web3 from 'web3'
import {range} from 'lodash'

// eslint-disable-next-line max-params
function retry(methodCall: any, params: any, callback: (err: any, data: any) => void, maxAttempts: number, scaleMS = 50, attempts = 0) {
  // eslint-disable-next-line no-useless-call
  return methodCall.request.call(null, ...params, (err: any, data: any) => {
    // If request is successful or we've reached maxAttempts, pass result through to callback
    if (!err || attempts === maxAttempts) {
      callback(err, data)
      return
    }

    // Otherwise, retry
    const backoff = scaleMS * (2 ** attempts)
    const jitter = backoff * 0.2 * (Math.random() - 0.5)
    setTimeout(() => {
      retry(methodCall, params, callback, maxAttempts, scaleMS, attempts + 1)
    }, backoff + jitter)
  })
}

function promisifiedRequest(methodCall: any, params: any, maxAttempts: number) {
  let requestData: any = null
  const promise = new Promise((resolve, reject) => {
    requestData = retry(methodCall, params, (err: any, data: any) => {
      if (err) reject(err)
      else resolve([...params, data])
    }, maxAttempts)
  })

  return [requestData, promise]
}

export class AsyncBatchRequest {
  batch: BatchRequest
  promises: Promise<unknown>[]

  constructor(web3: Web3) {
    this.batch = new web3.BatchRequest()
    this.promises = []
  }

  add(methodCall: any, ...params: any) {
    const [requestData, promise] = promisifiedRequest(methodCall, params, 10)
    this.batch.add(requestData)
    this.promises.push(promise)
  }

  async execute() {
    this.batch.execute()
    return Promise.all(this.promises)
  }
}

export const getBlockNumberBatches = (
  startBlock: number,
  endBlock: number,
  batchSize: number,
  blockInterval = 1,
) => {
  return range(startBlock, endBlock + 1, batchSize).map(batchStartBlock =>
    range(
      batchStartBlock,
      Math.min(endBlock + 1, batchStartBlock + batchSize),
      blockInterval,
    ),
  )
}
