# Repartments

Your GitHub, as a tiny apartment building.

Type a GitHub username and get a cozy 3D tower: every public repo is a floor, every technology a chibi resident. Step inside a flat and watch the stack act out how it works together: the front end asks for data, the guard checks the token, the back end checks the cache, fetches rows from the database, tests inspect the parcel, and the page shows up on the TV. Open pull requests bring a visitor; failing checks start an argument.

It's an illustration of a repo's shape, never its contents: no code, routes, data or secrets ever reach the browser.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS v4
- three.js with react-three-fiber and drei
- Kenney Mini Characters and Furniture Kit (CC0)
- A Vercel function talking to GitHub's GraphQL API (token stays on the server)
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
- **Abuse can only cost the token's hourly quota.** Each building is cached at the edge for an hour, URLs that would skip that cache are redirected to the cached one, and each visitor gets 20 uncached lookups a minute. If the quota still runs out, the site says GitHub asked it to slow down until the hour resets.

Found a security problem? Please report it privately through the repo's **Security → Report a vulnerability**, not in a public issue.

How it all works, step by step (in Portuguese): [docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md).

## Credits

Made by [Daniel Bernardes](https://github.com/Yourdevdaniel) · [bernardes.dev](https://bernardes.dev). Characters and furniture by [Kenney](https://kenney.nl) (CC0). Font: [Nunito](https://fonts.google.com/specimen/Nunito) (SIL Open Font License), via Fontsource.

## License

[MIT](LICENSE): use it, change it, run your own. The Kenney models in `public/models` are CC0.
