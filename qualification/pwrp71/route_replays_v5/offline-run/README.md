# V5 offline run inventory

The final offline matrix is `pwrp71-v5-provenance-full-20261008-cap5usd/`. It pins the current v5 fixture manifest `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`, completed 125/125 mock results across 25 profiles and five report types, and reported zero provider cost.

Other directories are retained as history:

- `pwrp71-v5-full-20261008/` is the earlier 125-result v5 run, before writer-visible response provenance was added to packet observations. Its packets and runtime pin are stale for the final corpus.
- `pwrp71-v5-provenance-full-20261008/` is a low-cap preflight. Its 1-microdollar aggregate ceiling was below the mock reservation estimate; all requests were stopped before provider calls and cost remained zero.

The final run used the explicit `route-replays-v5` fixture set. No v4 or older packet archive was selected as a fallback.
