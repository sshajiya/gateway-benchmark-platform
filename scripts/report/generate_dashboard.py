#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from html import escape


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def metric_value(data, key, default="N/A"):
    obj = data.get("metrics", {}).get(key, {})
    if "value" in obj:
        return obj["value"]
    if "avg" in obj:
        return obj["avg"]
    if "rate" in obj:
        return obj["rate"]
    if "count" in obj:
        return obj["count"]
    return default


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    results_dir = Path(args.results_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(results_dir.glob("*.json"))
    summaries = []
    metadata = {}

    for file in files:
        data = load_json(file)

        if file.name == "run-metadata.json":
            metadata = data
            continue

        summaries.append(
            {
                "file": file.name,
                "vus_max": metric_value(data, "vus_max"),
                "http_req_failed": metric_value(data, "http_req_failed"),
                "http_req_duration": metric_value(data, "http_req_duration"),
                "iterations": metric_value(data, "iterations"),
            }
        )
        (output_dir / file.name).write_text(json.dumps(data, indent=2), encoding="utf-8")

    rows = "\n".join(
        f"""
        <tr>
          <td><a href="{escape(item['file'])}">{escape(item['file'])}</a></td>
          <td>{escape(str(item['vus_max']))}</td>
          <td>{escape(str(item['http_req_failed']))}</td>
          <td>{escape(str(item['http_req_duration']))}</td>
          <td>{escape(str(item['iterations']))}</td>
        </tr>
        """
        for item in summaries
    )

    meta_html = f"""
    <p><strong>Gateway:</strong> {escape(str(metadata.get('gateway', 'N/A')))}</p>
    <p><strong>Version:</strong> {escape(str(metadata.get('version', 'N/A')))}</p>
    <p><strong>Node IP:</strong> {escape(str(metadata.get('node_ip', 'N/A')))}</p>
    <p><strong>HTTP Port:</strong> {escape(str(metadata.get('http_port', 'N/A')))}</p>
    <p><strong>HTTPS Port:</strong> {escape(str(metadata.get('https_port', 'N/A')))}</p>
    <p><strong>Host Header:</strong> {escape(str(metadata.get('host_header', 'N/A')))}</p>
    """

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Gateway Benchmark Results</title>
  <style>
    body {{
      font-family: Arial, sans-serif;
      margin: 32px;
      color: #222;
    }}
    h1 {{
      margin-bottom: 10px;
    }}
    .meta {{
      background: #f6f8fa;
      padding: 16px;
      border-radius: 10px;
      margin-bottom: 24px;
    }}
    table {{
      border-collapse: collapse;
      width: 100%;
    }}
    th, td {{
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
    }}
    th {{
      background: #f3f3f3;
    }}
  </style>
</head>
<body>
  <h1>Gateway Benchmark Results</h1>
  <div class="meta">
    {meta_html}
  </div>
  <table>
    <thead>
      <tr>
        <th>Result File</th>
        <th>VUs Max</th>
        <th>HTTP Failed</th>
        <th>HTTP Duration</th>
        <th>Iterations</th>
      </tr>
    </thead>
    <tbody>
      {rows}
    </tbody>
  </table>
</body>
</html>
"""
    (output_dir / "index.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()