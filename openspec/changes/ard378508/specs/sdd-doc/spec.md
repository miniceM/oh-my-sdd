## ADDED Requirements

### Requirement: sdd-doc script resolves to correct path
The system SHALL resolve the `sdd_doc.py` script path correctly when executing steps 3.5.2 and 4 of the `/sdd-doc` command workflow.

#### Scenario: Script path resolution succeeds
- **WHEN** agent executes `python3 skills/sdd-doc/scripts/sdd_doc.py` from project root
- **THEN** the script SHALL execute without "No such file or directory" error
