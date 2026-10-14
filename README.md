# Fabric IQ samples

Reusable examples for planning, maintenance, procurement and equipment telemetry.
Data is synthetic and generated with a fixed seed. Contoso is fictional.

The repository contains a reviewed subset of reusable samples. An explicit
file allowlist keeps delivery documents separate.

## Included

- Eighteen source tables, gold transformations and three Direct Lake models.
- Eventstream, Eventhouse, dashboard and a bounded telemetry producer.
- Three subject-area data agents and an evaluation notebook.
- [Prep for AI instructions](docs/ai-instructions/README.md) for the planning,
  maintenance and procurement semantic models.
- Deployment helpers, local tests and [setup instructions](docs/setup.md).

No customer documents, slides, agendas, delivery notes or session recap are part
of this repository. Plan, ontology, graph, Foundry and approval-flow configuration
are not included in this repository.

## Setup

Use Python 3.12 and a separate Fabric workspace on an active capacity.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
az login
python tools/check_package.py
python tools/setup_workshop.py --check-local
```

Continue with [the setup guide](docs/setup.md). The scripts require an explicit
workspace. Foundation setup overwrites the sample tables but keeps existing item
definitions unless `--update` is supplied.

## Checks

```bash
python -m unittest discover -s tests
python tools/validate_silver_data.py
python tools/check_package.py
```

[public-files.txt](public-files.txt) lists every intended repository file.
The package check rejects unlisted files, document formats, missing local links
and references to files outside the repository. This is a guard, not permission
to publish; additions still need review.

## Licence and limitations

[BSD 2-Clause](LICENSE). Sample code, not a production solution or supported
product. See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Stop producers and agents when finished. Capacity charges continue independently
of whether a local script is running.
