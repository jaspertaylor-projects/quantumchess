"""Exercise retries without contacting production or waiting between attempts."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

PROBE = Path(__file__).resolve().parents[1] / 'uptime-probe.sh'
FAKE_CURL = '''#!/usr/bin/env bash
count=$(cat "$PROBE_STATE" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$PROBE_STATE"
while [[ "$1" != --output ]]; do shift; done
shift
body="$1"
case "$PROBE_CASE" in
  down) printf 000; exit 7 ;;
  transient-http) if [[ "$count" -lt 3 ]]; then printf 404; exit 22; fi ;;
esac
if [[ "$PROBE_CASE" == wrong-content || ( "$PROBE_CASE" == transient-content && "$count" -eq 1 ) ]]; then
  echo maintenance > "$body"
else
  echo 'Quantum Chess' > "$body"
fi
printf 200
'''


class UptimeProbeTests(unittest.TestCase):
    def test_retries_and_persistent_failures(self):
        for case, expected_code, attempts in [
            ('healthy', 0, 1), ('transient-http', 0, 3),
            ('transient-content', 0, 2), ('down', 1, 3),
            ('wrong-content', 1, 3),
        ]:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for name, content in [('curl', FAKE_CURL), ('sleep', '#!/bin/sh\nexit 0\n')]:
                    path = root / name
                    path.write_text(content)
                    path.chmod(0o755)
                state = root / 'attempts'
                env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}',
                           PROBE_STATE=str(state), PROBE_CASE=case)
                result = subprocess.run(['bash', str(PROBE), 'test', 'https://example.invalid', 'quantum'],
                                        env=env, capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, expected_code, result.stdout + result.stderr)
                self.assertEqual(int(state.read_text()), attempts)
                self.assertEqual('::error::' in result.stdout, expected_code != 0)


if __name__ == '__main__':
    unittest.main()
