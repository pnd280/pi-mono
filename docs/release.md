# Release a version

[Workspace development](development.md)

Work happens on `dev`. A version reaches `master` through a pull request from `dev`.

1. Find the commits of the version. Each `v<version>` tag is on a `release` build commit, whose message `chore(release): build <sha>` names the `master` commit that it built. The range starts at that commit of the latest tag, because a range from the tag itself lists too many commits.

   ```sh
   tag=$(git tag --list 'v*' --sort=-v:refname | head -1)
   git log --oneline "$(git log -1 --format=%s "$tag" | sed -n 's/^chore(release): build //p')..HEAD"
   ```

2. Write `changelog/<version>.md` in the form of the previous changelog. For a breaking Pi host change, tell users how to upgrade Pi and which tag keeps the previous host version.
3. Check each entry against the code, not against the commit message: export lists, settings, limits, and behaviour. Take test counts from `vpr test:count`, never from commit messages.
4. Raise `version` in the root `package.json`, and commit it with the changelog.
5. Have a read-only reviewer compare the changelog with the diff of the range, and fix the findings that the code confirms.
6. Open the pull request from `dev` to `master`. Use absolute links in its body, because relative links do not resolve there.
7. Merge with a merge commit. The `release` job then builds the tree and adds the tag.
8. Write the release notes to `.tmp/release-notes.md`: the changelog without its title, with each relative link changed to `https://github.com/pnd280/pi-mono/blob/<merge commit>/<path>`. Then publish the GitHub release for the tag:

   ```sh
   gh release create v<version> --verify-tag --title v<version> --notes-file .tmp/release-notes.md
   ```
