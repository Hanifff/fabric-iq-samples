from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from check_package import check_links, check_paths
from setup_workshop import PHASES, templates


class PackageTests(unittest.TestCase):
    def test_unapproved_file_is_rejected(self):
        errors = check_paths({"README.md", "notes.md"}, {"README.md"})
        self.assertIn("Unapproved file: notes.md", errors)

    def test_document_rejected_even_when_allowlisted(self):
        for file in ("recap.docx", "deck.pdf", "slides.pptx", "docs/workshop-summary.md"):
            with self.subTest(file=file):
                self.assertTrue(check_paths({file}, {file}))

    def test_missing_file_is_rejected(self):
        self.assertTrue(check_paths(set(), {"README.md"}))

    def test_links_must_resolve_inside_repo(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text(
                "[OK](setup.md) [Missing](missing.md) [Outside](../private.md)"
            )
            (root / "setup.md").write_text("# Setup")
            errors = check_links(root, {"README.md"})
            self.assertEqual(len(errors), 2)
            self.assertTrue(any("missing.md" in error for error in errors))
            self.assertTrue(any("../private.md" in error for error in errors))

    def test_no_unshipped_domain_phase(self):
        self.assertEqual(PHASES, ("foundation", "streaming", "agents"))
        with self.assertRaises(ValueError):
            templates("domain")
        self.assertEqual(len(templates("agents")), 4)


if __name__ == "__main__":
    unittest.main()
