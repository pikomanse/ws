// Runs before `npm publish`: a prerelease (1.0.0-rc.12) must not become `latest`, which is what
// `npm install @pikoman/ws` gives. publishConfig says `next`, but npm 11 logs "with tag latest"
// when no tag is given, so the tag must be given and is checked here: `npm publish --tag next`.
const version = process.env.npm_package_version ?? require('../package.json').version;
const tag = process.env.npm_config_tag ?? 'latest';
if (version.includes('-') && tag === 'latest') {
    console.error(`\n${version} is a prerelease: publish it with  npm publish --tag next\n`);
    process.exit(1);
}
