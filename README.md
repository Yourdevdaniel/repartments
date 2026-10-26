# Repartments

Your GitHub, as a tiny apartment building.

Type a GitHub username and get a cozy 3D tower: every public repo is a floor, every technology a chibi resident. Step inside a flat and watch the stack act out how it works together: the front end asks for data, the guard checks the token, the back end checks the cache, fetches rows from the database, tests inspect the parcel, and the page shows up on the TV. Open pull requests bring a visitor; failing checks start an argument.

The public building is an illustration of a repo's shape, never its contents: no code, routes, data or secrets ever reach the browser.

## Studio (closed for beta testing)

The studio, where you signed in with GitHub to turn any repository, private ones too, into an animated presentation, is closed to the public while it is rebuilt as a tool you run on your own computer. `/studio` now explains this, apologises, invites people to become testers and answers the usual questions. The public building stays open.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS v4
- three.js with react-three-fiber and drei
- Kenney Mini Characters and Furniture Kit (CC0)
- Vercel functions talking to GitHub's GraphQL and REST APIs (tokens stay on the server)
- Vitest

## Run your own

```sh
npm install
npm run dev     # uses GITHUB_TOKEN, or your logged-in GitHub CLI, for /api/building
npm test
npm run build
```

The API needs a GitHub token of your own. Either be logged in with the GitHub CLI (`gh auth login`), or make a fine-grained token (GitHub → Settings → Developer settings → Fine-grained tokens; repository access "Public repositories", no permissions) and put it in `.env.local`, following [.env.example](.env.example).

To put it online, import the repo on Vercel and set `GITHUB_TOKEN` there. Fine-grained tokens expire: in the last two weeks the function warns in its logs, and after that every building fails until you make a new one.

## Security

- **The token never leaves the server.** It lives in the server's environment only, can read nothing but public data, and what reaches the browser is tags (technology names, statuses), never files or code.
- **It reads only manifests and file names** of public repos: `package.json`, `requirements.txt`, compose files, `.gitignore` and the like. Forks and private repos are never fetched.
- **A strict CSP with Trusted Types** (`script-src 'self'`, `require-trusted-types-for 'script'`) shuts the usual doors to injected scripts.
- **Abuse can only cost the token's hourly quota.** Each building is cached at the edge for an hour, URLs that would skip that cache are redirected to the cached one, and each visitor gets 20 uncached lookups a minute. If the quota still runs out, the site says GitHub asked it to slow down until the hour resets.

## Privacy

The site has no sign-up, no database and no cookies. The privacy policy is at `/privacidade` (or `/privacy`), linked from every page; it covers what is handled under Brazil's LGPD, why, for how long, who else is involved (GitHub, Vercel) and how to use one's rights. The internal record of these operations is [docs/privacidade.md](docs/privacidade.md), and [ADR 0011](docs/adr/0011-privacidade-e-lgpd.md) the decision.

Found a security problem? Please report it privately through the repo's **Security → Report a vulnerability**, not in a public issue.

## Documentation (in Portuguese)

| Document | What's in it |
|---|---|
| [COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md) | How everything works, step by step, in plain words. |
| [arquitetura.md](docs/arquitetura.md) | Architecture (arc42 + C4 diagrams): blocks, flows, deployment, security, risks. |
| [api.md](docs/api.md) | Every endpoint, its parameters, answers and errors. |
| [configuracao.md](docs/configuracao.md) | Environment variables, running and deploying. |
| [adr/](docs/adr/README.md) | Architecture decision records. |

## Credits

Made by [Daniel Bernardes](https://github.com/Yourdevdaniel) · [bernardes.dev](https://bernardes.dev). Characters and furniture by [Kenney](https://kenney.nl) (CC0). Font: [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), via Fontsource.

## License

[MIT](LICENSE): use it, change it, run your own. The Kenney models in `public/models` are CC0.
