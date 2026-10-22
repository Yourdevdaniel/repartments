# Repartments

Your GitHub, as a tiny apartment building.

Type a GitHub username and get a cozy 3D tower: every public repo is a floor, every technology a chibi resident. Step inside a flat and watch the stack act out how it works together: the front end asks for data, the guard checks the token, the back end checks the cache, fetches rows from the database, tests inspect the parcel, and the page shows up on the TV. Open pull requests bring a visitor; failing checks start an argument.

The public building is an illustration of a repo's shape, never its contents: no code, routes, data or secrets ever reach the browser.

## Studio

Switch to **Studio** at the top (or go to `/studio`) and sign in with GitHub to open any repo your account can read, private ones too, and turn it into an animated show for people who don't code (a client, a stakeholder):

- **How it works:** the repo becomes a building where every floor is a scene: what the project lets you do (read from its README, buttons and commands), the main parts introducing themselves, customer journeys (open one of the site's pages, read from its routers or from where the page files live, press a button, confirm, the system does it and the screen shows it; read from each button's call in the same file), a request going through the system, an AI agent reading its instructions and choosing its tools, a background job. The parts, as residents, act it out in an office floor plan, walking round the furniture, with plain-language captions in the system's own words (the form's fields, what gets saved, the e-mail's subject). Before presenting, a few yes/no questions (each with an example) choose plain names or the code's own for the system's parts, the AI's tools and the outside services. Edit the script in your client's words, present it full screen with video-player controls and keys (pause, step by step, start and end, half to double speed, hide the controls; `?` lists them), save it as a file and open it later without signing in, or download it as an MP4 video (captions drawn in) or a PowerPoint (a slide per scene, with a picture and the steps), both made in the browser.
- **Commits:** another building where every floor is a commit: its author walks in and visits each part of the system they changed, and the more a part changed, the warmer its room. The ground floor shows which parts change the most.
- **Map:** the parts in bands (screens, API, security, business logic, AI, jobs, data), the arrows between them, the outside services they use, each AI agent's decision graph, and the commit heat on top.
- **Author's script:** a `repartments.json` at the repo's root (or imported in the studio) lets whoever knows the system say what it is, name its parts and pick the scenes, replacing the ones read from the code; the studio offers a prompt to copy so your own AI can write it, and sends nothing anywhere. Format, JSON Schema and the full prompt: [docs/roteiro.md](docs/roteiro.md).

No sign-in? "See an example" opens a made-up market's online shop (products, cart and checkout).

Sign-in is "Continue with GitHub" when the app's client secret is configured: the server trades the sign-in code for a token with that secret (kept only in the server's environment), with no session and no database. Without the secret, sign-in uses GitHub's device flow (the GitHub CLI's "enter this code" login) with just the public client ID. The token stays in the browser tab, which talks to api.github.com directly, and the analysis runs there too: static and deterministic, no AI service ever reads the code.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS v4
- three.js with react-three-fiber and drei
- Kenney Mini Characters and Furniture Kit (CC0)
- Vercel functions talking to GitHub's GraphQL and REST APIs (tokens stay on the server)
- GitHub sign-in: "Continue with GitHub" (GitHub App or OAuth App, with the client secret kept only in the server's environment), or the device flow without a secret
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

The studio needs the client ID of a GitHub App (recommended, read-only) or an OAuth App: `GITHUB_CLIENT_ID`, which is public. Add its client secret, `GITHUB_CLIENT_SECRET`, to get the "Continue with GitHub" button; it is secret and belongs only in `.env.local` or the host's environment (marked sensitive on Vercel). There is no session secret. Without the client secret, sign-in uses the device flow with the client ID alone (enable "Device Flow" on the app). In development, without a client ID, "Sign in" uses your GitHub CLI login instead (only from your own machine). Step by step, in Portuguese: [docs/configuracao.md](docs/configuracao.md).

## Security

For the public building:

- **The token never leaves the server.** It lives in the server's environment only, can read nothing but public data, and what reaches the browser is tags (technology names, statuses), never files or code.
- **It reads only manifests and file names** of public repos: `package.json`, `requirements.txt`, compose files, `.gitignore` and the like. Forks and private repos are never fetched.
- **Abuse can only cost the token's hourly quota.** Each building is cached at the edge for an hour, URLs that would skip that cache are redirected to the cached one, and each visitor gets 20 uncached lookups a minute. If the quota still runs out, the site says GitHub asked it to slow down until the hour resets.

For the studio:

- **No sessions on the server.** Sign-in is "Continue with GitHub" (the client secret is used only to trade the sign-in code, and the token reaches the vault through a two-minute cookie read once) or the device flow with the public client ID. The server relays those calls, keeps no session and no database, and the state and PKCE verifier protect the return from GitHub against forgery.
- **The token is locked in a vault.** A worker holds it in its own memory and the page never sees it, not even at sign-in. The vault only makes the reads the studio needs (no writes, whatever the token's scope), and forgets the token after 8 hours at most; the header counts down and warns in the last 10 minutes.
- **A strict CSP with Trusted Types** (`script-src 'self'`, `connect-src 'self' https://api.github.com`, `require-trusted-types-for 'script'`) shuts the usual doors to injected scripts.
- **Code stays with its owner.** The analysis runs in the browser of the person signed in with access to the repo; the code comes straight from GitHub and never reaches Repartments' server or any AI service. `.env` files, keys and certificates are never read. A saved presentation holds the script and file names, never code.

## Privacy

The site has no sign-up, no database and no advertising cookies. The privacy policy is at `/privacidade` (or `/privacy`), linked from every page and next to the sign-in button; it covers what is handled under Brazil's LGPD, why, for how long, who else is involved (GitHub, Vercel) and how to use one's rights. A presentation with commits can be saved without their authors' names. The internal record of these operations is [docs/privacidade.md](docs/privacidade.md), and [ADR 0011](docs/adr/0011-privacidade-e-lgpd.md) the decision.

Found a security problem? Please report it privately through the repo's **Security → Report a vulnerability**, not in a public issue.

## Documentation (in Portuguese)

| Document | What's in it |
|---|---|
| [COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md) | How everything works, step by step, in plain words. |
| [arquitetura.md](docs/arquitetura.md) | Architecture (arc42 + C4 diagrams): blocks, flows, deployment, security, risks. |
| [analise.md](docs/analise.md) | How the studio reads a repo: files, imports, parts, routes, AI agents, scenes. |
| [api.md](docs/api.md) | Every endpoint, its parameters, answers and errors. |
| [configuracao.md](docs/configuracao.md) | Environment variables, creating the GitHub App, running and deploying. |
| [roteiro.md](docs/roteiro.md) | The author's script (`repartments.json`): format, limits, schema and the prompt to copy. |
| [adr/](docs/adr/README.md) | Architecture decision records. |

## Credits

Made by [Daniel Bernardes](https://github.com/Yourdevdaniel) · [bernardes.dev](https://bernardes.dev). Characters and furniture by [Kenney](https://kenney.nl) (CC0). Font: [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), via Fontsource.

## License

[MIT](LICENSE): use it, change it, run your own. The Kenney models in `public/models` are CC0.
