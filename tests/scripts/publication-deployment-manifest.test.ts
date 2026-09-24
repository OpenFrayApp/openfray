// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nicola Mustone

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEPLOYMENT_MANIFEST_VERSION,
  createPublicationDeploymentManifest,
} from '../../scripts/publication-deployment-manifest.mjs'

/** Hash exact fixture bytes the way an evidence consumer does. */
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

const inputs = {
  publicationInterfaceVersion: 1,
  publishedShareSchemaVersion: 1,
  sourceManifestVersion: 1,
  contractBytes: 'contract bytes\n',
  sourceManifestBytes: 'source manifest bytes\n',
  sourceIndexes: [
    { sourceId: 'srd-5.2', path: 'console/compendium/srd-creatures.index.json', bytes: '{}' },
  ],
}

describe('publication deployment manifest', () => {
  it('records four independent versions and exact artifact hashes', () => {
    const generated = createPublicationDeploymentManifest(inputs)
    const parsed = JSON.parse(generated.manifestBytes)
    expect(DEPLOYMENT_MANIFEST_VERSION).toBe(1)
    expect(parsed).toEqual({
      deploymentManifestVersion: 1,
      publicationInterfaceVersion: 1,
      publishedShareSchemaVersion: 1,
      sourceManifestVersion: 1,
      artifacts: {
        contract: { path: 'console/src/publication/index.ts', sha256: sha256('contract bytes\n') },
        sourceManifest: {
          path: 'publication-source-manifest.json',
          sha256: sha256('source manifest bytes\n'),
        },
        sourceIndexes: [
          {
            sourceId: 'srd-5.2',
            path: 'console/compendium/srd-creatures.index.json',
            sha256: sha256('{}'),
          },
        ],
      },
    })
    expect(generated.sha256).toBe(sha256(generated.manifestBytes))
  })

  it('is deterministic and rejects duplicate source identities', () => {
    expect(createPublicationDeploymentManifest(inputs)).toEqual(
      createPublicationDeploymentManifest(inputs),
    )
    expect(() =>
      createPublicationDeploymentManifest({
        ...inputs,
        sourceIndexes: [...inputs.sourceIndexes, inputs.sourceIndexes[0]],
      }),
    ).toThrow(/duplicate source/i)
  })
})
