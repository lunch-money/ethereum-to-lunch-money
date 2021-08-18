# ESM-Typescript-Yarn 3 Skeleton

This repo contains a basic skeleton that attempts to use the current best
practices for a TypeScript pure-ESM project setup. Yarn 3 is used as the package
management system. It is intended to be the bare minimum to distribute a pure
ESM library for Node that is written in TypeScript and distributed as
Javascript.

It also includes a modern setup for running ESLint and Prettier on-commit and
on-save in Visual Studio Code.

**NB:** Unfortunately PnP and Zero Install are disabled, even though Yarn 3
supports these methods. It would be great to support this in the future, but I
was having issues generating the required SDK shims using the guide
[here](https://yarnpkg.com/getting-started/editor-sdks) that were coming from
PnP.

# Resources
- https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
- https://nodejs.dev/learn/the-package-json-guide
- https://www.aleksandrhovhannisyan.com/blog/format-code-on-save-vs-code-eslint/#typescript-eslint-config
