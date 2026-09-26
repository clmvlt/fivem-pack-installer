// Worker thread d'extraction : reçoit { file, target, sevenZip } et renvoie la progression au processus principal.
import { parentPort, workerData } from 'node:worker_threads'
import { ArchiveError, extractArchive } from './extractors'

interface Job {
  file: string
  target: string
  sevenZip: string | null
}

const job = workerData as Job

extractArchive(job.file, job.target, (p) => parentPort?.postMessage({ type: 'progress', progress: p }), job.sevenZip)
  .then((res) => parentPort?.postMessage({ type: 'done', result: res }))
  .catch((err: unknown) => {
    const code = err instanceof ArchiveError ? err.code : 'unknown'
    parentPort?.postMessage({ type: 'error', code, message: (err as Error)?.message ?? String(err) })
  })
