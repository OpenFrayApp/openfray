// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'

export const DEPLOYMENT_MANIFEST_VERSION = 1

/** Hash exact artifact bytes for deployment evidence. */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Build deterministic publication deployment evidence from assembled artifact bytes. */
export function createPublicationDeploymentManifest(inputs) {
  const ids = new Set()
  for (const source of inputs.sourceIndexes) {
    if (ids.has(source.sourceId)) throw new Error(`Duplicate source identity: ${source.sourceId}`)
    ids.add(source.sourceId)
  }
  const manifest = {
    deploymentManifestVersion: DEPLOYMENT_MANIFEST_VERSION,
    publicationInterfaceVersion: inputs.publicationInterfaceVersion,
    publishedShareSchemaVersion: inputs.publishedShareSchemaVersion,
    sourceManifestVersion: inputs.sourceManifestVersion,
    artifacts: {
      contract: {
        path: 'console/src/publication/index.ts',
        sha256: sha256(inputs.contractBytes),
      },
      sourceManifest: {
        path: 'publication-source-manifest.json',
        sha256: sha256(inputs.sourceManifestBytes),
      },
      sourceIndexes: inputs.sourceIndexes.map((source) => ({
        sourceId: source.sourceId,
        path: source.path,
        sha256: sha256(source.bytes),
      })),
    },
  }
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`
  return { manifestBytes, sha256: sha256(manifestBytes) }
}
