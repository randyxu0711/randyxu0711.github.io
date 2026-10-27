#!/usr/bin/env bash
cd "$(dirname "$0")" && uvx --from typst python -c "import typst; typst.compile('resume.typ', output='../../assets/resume/Randy-Xu-Resume.pdf', font_paths=['fonts'])" \
  && printf '# docs/resume/build.sh 產生\nupdated: %s\n' "$(date +%F)" > ../../_data/resume.yml
