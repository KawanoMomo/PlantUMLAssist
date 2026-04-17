# lib/

## plantuml.jar

- Source: https://github.com/plantuml/plantuml/releases
- License: MIT (embedded in jar)
- Version: v1.2024.7 (bundled at initial commit)
- Size: ~21 MB

To re-download:

```bash
curl -L -o plantuml.jar https://github.com/plantuml/plantuml/releases/download/v1.2024.7/plantuml-1.2024.7.jar
```

## Requirements

- Java 8+ in PATH for local render mode (`java -jar lib/plantuml.jar -tsvg -pipe`)
- Without Java: use online mode (plantuml.com) via the UI switch
