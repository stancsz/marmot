import { agentDocuments } from './agentRuntime'
import { StoredDocument } from '../agent'
import { extractRepoTarGz, parseRepoUrl, tarballUrl } from './repoCore'

/**
 * Import a public GitHub repository into document RAG: download the
 * tarball, extract text files under the budget, store as one searchable
 * document named repo:<owner>/<repo>.
 */
export async function importGitHubRepo(input: string): Promise<StoredDocument> {
  const spec = parseRepoUrl(input)
  const res = await fetch(tarballUrl(spec))
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'Repository not found — check the name (private repos are not supported yet).'
        : `Download failed (HTTP ${res.status}).`
    )
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const doc = extractRepoTarGz(bytes)
  if (doc.fileCount === 0) throw new Error('No readable text files found in that repository.')
  return agentDocuments.addDocument(`repo:${spec.owner}/${spec.repo}`, doc.text)
}
