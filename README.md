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

## Run it

```sh
npm install
npm run dev     # uses GITHUB_TOKEN, or your logged-in GitHub CLI, for /api/building
npm test
npm run build
```

Deploying: set `GITHUB_TOKEN` on Vercel to a fine-grained token with no repository permissions (public data only).

How it all works, step by step (in Portuguese): [docs/COMO-FUNCIONA.md](docs/COMO-FUNCIONA.md).

## Credits

Made by [Daniel Bernardes](https://github.com/Yourdevdaniel) · [bernardes.dev](https://bernardes.dev). Characters and furniture by [Kenney](https://kenney.nl) (CC0).
