import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "package_extension.py"
SPEC = importlib.util.spec_from_file_location("package_extension", SCRIPT)
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class PackageExtensionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "source"
        self.root.mkdir()
        for name in PACKAGE.ROOT_FILES:
            (self.root / name).write_text(
                json.dumps({"uuid": PACKAGE.UUID}) if name == "metadata.json" else name,
                encoding="utf-8",
            )
        (self.root / "lib").mkdir()
        (self.root / "prefs").mkdir()
        (self.root / "prefs" / "layoutPage.js").write_text(
            "export function buildLayoutPage() {}", encoding="utf-8",
        )
        (self.root / "lib" / "runtime.js").write_text("export const value = 1;", encoding="utf-8")
        (self.root / "tests").mkdir()
        (self.root / "tests" / "not-runtime.test.mjs").write_text("test", encoding="utf-8")
        self.output = Path(self.temp.name) / "dist" / "extension.zip"

    def tearDown(self):
        self.temp.cleanup()

    def test_package_contains_runtime_files_and_excludes_development_files(self):
        PACKAGE.build_package(self.root, self.output, "v1.2.3")
        with zipfile.ZipFile(self.output) as archive:
            names = set(archive.namelist())
            self.assertEqual(names, {
                "extension.js", "prefs.js", "stylesheet.css", "metadata.json", "lib/runtime.js", "prefs/layoutPage.js",
            })
            self.assertEqual(archive.read("lib/runtime.js"), b"export const value = 1;")
            self.assertEqual(
                archive.read("prefs/layoutPage.js"),
                b"export function buildLayoutPage() {}",
            )

    def test_control_center_runtime_module_is_in_the_extension_package(self):
        root = Path(__file__).resolve().parents[1]
        output = Path(self.temp.name) / "dist" / "material-panel.zip"
        PACKAGE.build_package(root, output, "v1.2.3")
        with zipfile.ZipFile(output) as archive:
            names = set(archive.namelist())
        self.assertIn("modules/controlCenter.js", names)

    def test_package_is_reproducible(self):
        PACKAGE.build_package(self.root, self.output, "v1.2.3")
        first = self.output.read_bytes()
        PACKAGE.build_package(self.root, self.output, "v1.2.3")
        self.assertEqual(self.output.read_bytes(), first)

    def test_invalid_release_version_is_rejected(self):
        with self.assertRaises(ValueError):
            PACKAGE.build_package(self.root, self.output, "1.2.3")

    def test_wrong_extension_uuid_is_rejected(self):
        (self.root / "metadata.json").write_text('{"uuid":"other"}', encoding="utf-8")
        with self.assertRaises(ValueError):
            PACKAGE.build_package(self.root, self.output, "v1.2.3")


    def test_clipboard_history_runtime_files_are_in_the_extension_package(self):
        root = Path(__file__).resolve().parents[1]
        output = Path(self.temp.name) / "dist" / "material-panel.zip"
        PACKAGE.build_package(root, output, "v1.2.3")
        with zipfile.ZipFile(output) as archive:
            names = set(archive.namelist())
        self.assertTrue({
            "lib/clipboardHistoryState.js",
            "lib/clipboardHistoryController.js",
            "lib/clipboardHistoryStore.js",
            "modules/clipboardHistory.js",
            "prefs/clipboardHistoryPage.js",
        }.issubset(names))


if __name__ == "__main__":
    unittest.main()
