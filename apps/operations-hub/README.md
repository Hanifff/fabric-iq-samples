# Operations Hub (Fabric app)

A sample web app built with Fabric Apps (preview) and the Rayfin CLI, on top of the
semantic models and data agents in this repository. It shows dashboards and a map, lets
people record equipment condition on simple 3D models, sends changes to a named approver
(four-eyes), and answers questions through the data agents. All data is synthetic.

Sample code, not a supported product.

## Pages

| Page | What it does |
| --- | --- |
| Overview, Planning, Maintenance, Procurement | Figures and trends from the three semantic models |
| Map | Installations and yards; a marker opens the site in 3D |
| 3D assets | A 3D model per site drawn in code, the equipment register, condition, findings and a 4D plan |
| Approvals | Which projects are pushed and when; changes become requests that a named approver decides |
| Ask the data | One data agent directly, or an optional Foundry agent that picks one |
| Ideas | Ideas and votes |
| Access | Who can do what |

## How the app reaches the data

| # | Path | Pages | Runs as |
| --- | --- | --- | --- |
| 1 | Semantic-model connector (DAX) | Overview, Planning, Maintenance, Procurement, Map | The signed-in user, with their own model permissions and row-level security |
| 2 | The app's own SQL database, through its data API | 3D assets, Approvals, Ideas | The app, after checking the rules in `rayfin/data/` for the signed-in user |
| 3 | Functions that call a data agent or a Foundry agent | Ask the data | The owner of the app item, for every user |

Path 3 gives every user the owner's access to the agents' data, so deploy as an owner who
may see only what all users may see. Workspace roles bypass path 2: anyone with a role in
the workspace, Viewer included, can read the app's database directly. Give users the app,
not the workspace.

## Files

| Path | What it holds |
| --- | --- |
| `rayfin/rayfin.yml` | Sign-in, database, hosting, functions and the three semantic-model connectors |
| `rayfin/data/` | The app's tables and their access rules, one file per table |
| `rayfin/functions/src/function_app.ts` | `askDataAgent` and `askFoundryAgent`, with their settings at the top |
| `src/pages/` | The pages (React) |
| `src/ops/` | Data and rules for 3D assets and Approvals; `seed.json` is the sample data |
| `src/three/` | The 3D models and viewer (three.js) |

## Set up

You need:

- The samples deployed to a workspace: the foundation and agents phases of
  [the setup guide](../../docs/setup.md), with the three data agents published.
- Fabric Apps enabled in the tenant (preview), and the workspace on a capacity in a
  supported region.
- Node.js 20.19+, 22.12+ or 24, and Contributor or higher in the workspace.

Then:

1. **Connect the semantic models.** In `rayfin/rayfin.yml`, replace `YOUR-WORKSPACE-GUID`
   and the three `YOUR-…-MODEL-GUID` values with the IDs of
   `sm_contoso_dev_swc_planning_01`, `sm_contoso_dev_swc_maintenance_01` and
   `sm_contoso_dev_swc_procurement_01`. Each ID is in the item's Fabric URL.
2. **Point Ask the data at the agents.** At the top of
   `rayfin/functions/src/function_app.ts`, set `WORKSPACE_ID` and the three data agent
   IDs. For the optional Foundry agent, also set `FOUNDRY_PROJECT` and `FOUNDRY_AGENT`.
   Give that agent the data agents as tools through the
   [Fabric IQ tool](https://learn.microsoft.com/azure/foundry/agents/how-to/tools/fabric-iq).
   With connections that pass on the caller's token, the agents answer as the app owner.
3. **Name the approvers.** Create `rayfin/.env` with
   `RAYFIN_PUBLIC_APPROVERS=you@contoso.com` (comma-separated e-mail addresses). Without
   it nobody can approve. In our tests, Entra groups did not reach the app's rules.
4. **Build and deploy** from this folder:

   ```bash
   npm ci
   npm run check
   npx rayfin login
   npx rayfin up --workspace-id "$WORKSPACE_ID"
   ```

   Without `--workspace-id`, Rayfin deploys to My Workspace. The deploy prints the app
   URL and writes `rayfin/.env` and `rayfin/.deployments.json`, both git-ignored. If
   sign-in fails on a machine without a credential store, see
   [Troubleshoot Fabric Apps](https://learn.microsoft.com/fabric/apps/troubleshooting).
5. **Load the sample data.** Open the app as an approver, go to Approvals and select
   **Load sample data**. It only adds missing rows. To regenerate `src/ops/seed.json`,
   run `python tools/build_app_ops_data.py` from the repository root.
6. **Share the app.** Give users **Run and interact** on the app item, plus Read and
   Build on the three semantic models. Do not give them a workspace role.

## Work locally

| Command | What it does |
| --- | --- |
| `npm run check` | Tests, type-check and build |
| `npm run dev` | The front end on your machine against the deployed backend (after the first deploy) |
| `npx vite`, then open `/preview.html` | 3D assets, Approvals and Access with in-memory sample data; no Fabric or sign-in |

## Remove

Delete the workspace you created for the samples; the app goes with it. To keep the
workspace, delete the app item and its child items (SQL database, user data functions).

## Limits

- Fabric Apps is in preview. Functions run as the app owner and stop after 240 seconds.
- Deployment pipelines and Git integration don't support Fabric apps yet. Deploy each
  workspace with `rayfin up`, for example from CI.

## Licence

The app was scaffolded from a Fabric Apps template that carries the MIT licence in
[LICENSE](LICENSE). The repository [licence](../../LICENSE) applies to the rest.
