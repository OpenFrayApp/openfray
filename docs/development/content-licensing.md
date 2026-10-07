# Content ingestion checklist

Use this checklist when adding or updating a compendium source. The code license
and each content source's license are separate.

## Establish the source license

1. Record the source, edition, and its actual license.
2. Prefer CC-BY, then ORC, then OGL where the source offers those choices.
   A publisher's name alone does not establish a license.
3. Use CC-BY-4.0 for Wizards of the Coast SRD content. SRD 5.2 is CC-BY-only;
   for the dual-licensed SRD 5.1, OpenFray elects CC-BY.
4. Exclude material outside the source's license. SRD-excluded creatures and other
   proprietary Wizards of the Coast content cannot enter the shipped datasets.

## Meet the license requirements

For CC-BY material, preserve the required attribution, link its license, identify
changes, and avoid implying endorsement.

For ORC material, follow the source's ORC notice and attribution requirements.
Identify the material the source designates for reuse.

For OGL material, ingest only declared Open Game Content. Exclude Product Identity,
including excluded art, fiction, names, and sidebars. Include the complete OGL 1.0a,
the verbatim Section 15 attribution chain, and OpenFray's Open Game Content designation.

Update the console's
[CREDITS.md](https://github.com/OpenFrayApp/console/blob/main/CREDITS.md)
and its in-app credits when adding a source. The credits file is the public record
of compliance.

## Validate and publish

1. Edit the generators or authored typed sources in the compendium repository.
2. Run the source's ingest command and dataset validator.
3. Run the challenge-rating estimate for new or rebalanced original creatures.
4. Review the output for excluded material and correct attribution.
5. Copy the vetted JSON from compendium `output/` into console
   `public/compendium/`. Commit the shipped JSON in the console repository.

Keep source PDFs and extraction scratch out of Git. Contributors obtain licensed
source material themselves. The site reads the console's shipped JSON for stat
blocks; its authored chapter prose remains in the site repository.

The compendium
[README](https://github.com/OpenFrayApp/compendium/blob/main/README.md)
documents the ingest, validation, and publishing commands.
