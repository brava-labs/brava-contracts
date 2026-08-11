# Security Audits

This directory tracks security audit reports for the Brava smart contracts.

## Published Audits

### Sigma Prime -- Core Protocol Audit

Full audit of the Brava smart contract suite covering the core execution engine, auth system, Safe integration, and protocol actions.

- [View Report (PDF)](https://github.com/sigp/public-audits/blob/master/reports/brava/report.pdf)

### Sigma Prime -- Module Integrations Add-on Audit

Follow-up audit covering additional protocol integrations added after the core audit.

- [View Report (PDF)](https://github.com/sigp/public-audits/blob/master/reports/brava/module-integrations/report.pdf)

### Sigma Prime -- Core Auth Changes Audit

Follow-up audit of the authentication and execution changes: the EIP-712 typed-data Safe module, AuthRegistry, CCTP bundle relay, emergency withdrawals, and the gas refund system, plus an LLM-assisted scan of the full codebase.

- [View Report (PDF)](https://github.com/sigp/public-audits/blob/master/reports/brava/core-auth/Sigma_Prime_Brava_Core_Auth_Changes_Security_Assessment_Report_v3_0.pdf)
- Assessed commits: cycle 1 at `01d8274`, cycle 2 at `017f1345` (an audit-time source snapshot, preserved on the `audit/core-auth-cycle2-snapshot` branch), and resolutions at `826d0ab`. All resolution commits cited in the report are on `main`.

## Upcoming

Further audit reports will be linked here as they are completed and approved for public release.

For questions about our security audits, please open an issue in this repository.
