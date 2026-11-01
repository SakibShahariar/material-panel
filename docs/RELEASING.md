# Releasing Material Panel

Releases are published from version tags in the form `vMAJOR.MINOR.PATCH`.

1. Review the changes since the previous release and update the project documentation if needed.
2. Confirm the automated test workflow is green on `main`.
3. Create and push a stable version tag, for example:

   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

4. The release workflow validates the tag, tests the ZIP builder, packages only the extension runtime files, generates release notes, and publishes the ZIP to a GitHub release.
5. Download the generated archive and verify that GNOME Extensions can install it before recommending the release to users.

The ZIP is built reproducibly and contains the root extension files plus `lib/`, `modules/`, and `assets/`. Tests, documentation, development scripts, and repository metadata are excluded.

The workflow does not publish to extensions.gnome.org. That remains a separate step after the GitHub release process has been exercised successfully.
