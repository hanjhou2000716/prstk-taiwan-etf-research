from pathlib import Path


WORKFLOW = Path(__file__).parents[1] / ".github/workflows/research-pipeline.yml"


def test_research_workflow_persists_only_historical_twse_raw_state():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    cache_block = workflow.split("- name: Restore TWSE historical raw cache", 1)[1].split(
        "- run: python -m prstk_research.pipeline", 1
    )[0]

    assert "uses: actions/cache@v4" in cache_block
    assert "path: data/raw/twse" in cache_block
    assert "key: prstk-twse-raw-v1-${{ runner.os }}-${{ github.run_id }}" in cache_block
    assert "prstk-twse-raw-v1-${{ runner.os }}-" in cache_block
    assert "data/processed" not in cache_block
    assert "artifacts" not in cache_block
    assert "site/data" not in cache_block
