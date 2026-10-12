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


def test_known_effort_mismatch_is_rejected_but_unknown_metadata_is_not_guessed():
    import pytest

    from zippercrew.models import validate_effort

    choices = [{"backend": "codex", "model": "small", "efforts": ["low", "high"]}]
    selection = {"backend": "codex", "model": "small", "reasoning_effort": "ultra"}
    with pytest.raises(ValueError, match="small does not list reasoning effort 'ultra'"):
        validate_effort(selection, choices)
    validate_effort({**selection, "reasoning_effort": "high"}, choices)
    validate_effort({**selection, "reasoning_effort": ""}, choices)
    validate_effort({**selection, "model": ""}, choices)
    validate_effort({**selection, "model": "unknown"}, choices)
    validate_effort(selection, [])
