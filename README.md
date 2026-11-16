# places-compat

Replacements for three React libraries built on the legacy Google Places API. Each package keeps the public API of the original and gets its data from the Places API (New), so you can install it under the original name and keep your imports. A private package, `@places-compat/core`, holds the shared code and is bundled into each library, so it is never installed on its own.

| Package | Replaces |
| --- | --- |
| `@places-compat/use-places-autocomplete` | `use-places-autocomplete` 4.0.1 |
| `@places-compat/react-places-autocomplete` | `react-places-autocomplete` 7.3.0 |
| `@places-compat/react-autocomplete` | `react-google-autocomplete` 2.7.5 |

Each package README has a "Differences from the original" table that lists every known change in behaviour and what covers it: a test, the allowlist of the comparison tests, or the docs alone:

- [use-places-autocomplete](packages/use-places-autocomplete/README.md#differences-from-the-original)
- [react-places-autocomplete](packages/react-places-autocomplete/README.md#differences-from-the-original)
- [react-autocomplete](packages/react-autocomplete/README.md#differences-from-the-original)

## Status

Version 0.1.0 is the first release on npm. The tests use a fake of the Places API (New) and have not yet run against Google's live service. If a package behaves differently from its original, please open an issue.

## Before you switch

Enable Places API (New) in the Google Cloud project that owns your API key. The packages only call the new API and have no fallback to the legacy Places API, so a project with only the legacy API enabled gets errors instead of predictions.

Load version 3.57.2 or later of the Maps JavaScript API. `AutocompleteSuggestion` first shipped in that version. With an older pinned version, each package reports the error of its original with an extra line about this requirement.

Check what the switch does to your bill. Requests are billed under the Places API (New) SKUs. In a session that ends with a details request, the fields you ask for set the price of the whole session:

- With only Essentials fields, such as `address_components`, `formatted_address` and `geometry`, the first 12 autocomplete requests of the session are billed and the rest are not.
- With any Pro, Enterprise or Atmosphere field (`name` is Pro), the session is billed at the Place Details Enterprise + Atmosphere rate, whatever the other fields are.
- A details request with no `fields` asks for every field the package can map, so it is billed at that highest rate. List only the fields you read.
- A session that ends without a details request, and every request sent without a session token, is billed per request.

The packages differ in how they use session tokens. Each package README explains when its requests carry one.

## Migrating

Install the package under the name of the original with an npm alias. Your imports keep working:

```sh
npm i use-places-autocomplete@npm:@places-compat/use-places-autocomplete
pnpm add use-places-autocomplete@npm:@places-compat/use-places-autocomplete
yarn add use-places-autocomplete@npm:@places-compat/use-places-autocomplete
```

The same form works for the other two:

```sh
npm i react-places-autocomplete@npm:@places-compat/react-places-autocomplete
npm i react-google-autocomplete@npm:@places-compat/react-autocomplete
```

An alias only renames your own dependency. If another package in your tree depends on the original, override that dependency as well.

With npm, add `overrides` to your root `package.json`. The override must use the same specification as your direct dependency, or npm stops with `EOVERRIDE`. Copy the value from `dependencies`, or use the `$` form, which points at it:

```json
{
  "dependencies": {
    "use-places-autocomplete": "npm:@places-compat/use-places-autocomplete@^0.1.0"
  },
  "overrides": {
    "use-places-autocomplete": "$use-places-autocomplete"
  }
}
```

With pnpm, put the override in `pnpm-workspace.yaml`:

```yaml
overrides:
  use-places-autocomplete: npm:@places-compat/use-places-autocomplete@^0.1.0
```

Older pnpm versions read the same map from `pnpm.overrides` in `package.json` instead:

```json
{
  "pnpm": {
    "overrides": {
      "use-places-autocomplete": "npm:@places-compat/use-places-autocomplete@^0.1.0"
    }
  }
}
```

With Yarn, use `resolutions` in your root `package.json`. This form has not been tested:

```json
{
  "resolutions": {
    "use-places-autocomplete": "npm:@places-compat/use-places-autocomplete@^0.1.0"
  }
}
```

## Development

```sh
pnpm install
pnpm verify
```

Run these from the repository root:

| Script | What it does |
| --- | --- |
| `pnpm verify` | Runs lint, type checks, tests, type tests, the build and the repository checks, and stops at the first failure. Every change must pass it. |
| `pnpm test:react <17\|18\|19>` | Runs the test suites against one React major. 17 and 18 run in a temporary copy of the repository and never modify the checkout. |
| `pnpm build` | Builds the three libraries with tsdown. |
| `pnpm check:differences` | Checks the differences table in each library README against the test paths and the ids in the package's comparison allowlist. |
| `pnpm check:dist` | Checks the build output of each library. |
| `pnpm check:tarball [pkg]` | Checks the packed tarball of each library, or of `pkg` only. |

To check one package, run `pnpm --filter <name> verify`, for example `pnpm --filter @places-compat/use-places-autocomplete verify`.

Keep commits small and start the subject with one of `feat:`, `fix:`, `test:`, `docs:`, `build:`, `chore:`, `refactor:`, `perf:` or `ci:`, optionally with a lowercase scope such as `feat(core):`. Write the subject in the imperative mood, in 72 characters or fewer.

Every behaviour ships with its test in the same change. Tests never call Google, and the repository holds no API keys. Each package must keep 90% line and branch coverage on its `src` folder. The core package leaves `src/testing` out of that count.

When a package behaves differently from its original, add a row to the differences table in that package's README. Library ids use the package prefix (`UPA-`, `RPA-`, `RGA-`) and shared ids use `CORE-`. Ids are never reused or renumbered, so gaps in a sequence are expected.

Under `test/types/`, names that start with `react` are reserved for `react<major>/` folders, each with its own `tsconfig.json`. `pnpm test:types` fails on any other file or folder there whose name starts with `react`.

Files ported or mirrored from the original packages start with a one-line header that names the origin and its license.

Add a changeset for every change a package user would notice:

```sh
pnpm exec changeset
```

It asks which packages changed and the bump type of each, and writes a file to `.changeset/`. Commit that file with the change, with one plain sentence that says what changed for the user. The core package is private and never released on its own, so when a change to the core affects a library, add the changeset for that library. Releases are published by hand, not from CI.

## Google Maps Platform

The packages work with Google Maps Platform. This project is not affiliated with or endorsed by Google. Google Maps and Google Maps Platform are trademarks of Google LLC.

## License

MIT. See [LICENSE](LICENSE).
