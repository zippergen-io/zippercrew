import json

from zippercrew.models import claude_choices, model_choices


def test_model_catalog_reads_only_visible_metadata(tmp_path, monkeypatch):
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    monkeypatch.setattr("zippercrew.models.shutil.which", lambda _: None)
    cache = tmp_path / "models_cache.json"
    cache.write_text(
        json.dumps(
            {
                "models": [
                    {
                        "slug": "local-model",
                        "display_name": "Local Model",
                        "visibility": "list",
                        "supported_reasoning_levels": [{"effort": "high"}, {"effort": "ultra"}],
                    },
                    {"slug": "internal-model", "visibility": "hide"},
                    None,
                ],
                "unrelated": "not exposed",
            }
        )
    )
    assert model_choices() == [
        {
            "backend": "codex",
            "model": "local-model",
            "label": "Local Model",
            "efforts": ["high", "ultra"],
        }
    ]
    cache.write_text("invalid cache")
    assert model_choices() == []


def test_claude_picker_uses_installed_help_aliases_and_efforts():
    assert claude_choices("""
  --effort <level>  Effort for the session (low, medium, high, max)
  --model <model>   Provide an alias (e.g. 'fable', 'opus', or 'sonnet')
                   or a model's full name.
  --name <name>    Label
""") == [
        {
            "backend": "claude",
            "model": model,
            "label": f"Claude {model.capitalize()}",
            "efforts": ["low", "medium", "high", "max"],
        }
        for model in ["fable", "opus", "sonnet"]
    ]
    assert claude_choices("CLI help is unavailable") == []
