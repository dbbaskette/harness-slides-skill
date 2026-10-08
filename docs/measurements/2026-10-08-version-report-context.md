# Version reporting context

Measured with `cl100k_base`; exact inputs/hashes and routes are in the accompanying
JSON. Bootstrap + guidance entry increased from 1,163 to **1,239 tokens** (+76).
The normalized start receipt adds **54 tokens** for runtimeVersion and the exact
executable digest. Ordinary end-to-end route totals therefore increase by 130
instruction/receipt tokens. Runtime code and release archive bytes are not loaded
into the agent's context. Version reporting needs no provider access.
