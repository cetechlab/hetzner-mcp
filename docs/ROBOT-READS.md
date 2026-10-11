# Robot read coverage

Every read endpoint in the Robot webservice documentation
(https://robot.hetzner.com/doc/webservice/en.html, index read on 2026-10-11): 49 GETs and
`POST /traffic`, which only queries. Each row is served by a tool or left out with a reason.
`test/robot-reads.ts` proves each covered call sends exactly that one request, with passwords
redacted, in read-only mode and with writes on. This file is generated from
`test/robot-endpoints.ts`; regenerate it with `npx tsx test/robot-reads.ts --write-doc`.

Ids are checked before they go into a path: server numbers and numeric ids are digits,
addresses are plain IPv4 or IPv6 without a mask, key fingerprints are MD5 hex pairs, product
ids start with a letter. Views are fixed sub-paths chosen by name. Robot tools reject unknown
arguments. `POST /traffic` is the one POST the read-only gate lets out.

| # | Endpoint | Tool | Arguments, or why it is left out |
|---|---|---|---|
| 1 | `GET /server` | `robot_list_servers` | (none) |
| 2 | `GET /server/{server-number}` | `robot_list_servers` | id: 321 |
| 3 | `GET /server/{server-number}/cancellation` | `robot_list_servers` | id: 321; view: cancellation |
| 4 | `GET /ip` | `robot_list_ips` | (none) |
| 5 | `GET /ip/{ip}` | `robot_list_ips` | id: 203.0.113.10 |
| 6 | `GET /ip/{ip}/cancellation` | `robot_list_ips` | id: 203.0.113.10; view: cancellation |
| 7 | `GET /ip/{ip}/mac` | `robot_list_ips` | id: 203.0.113.10; view: mac |
| 8 | `GET /subnet` | `robot_list_subnets` | (none) |
| 9 | `GET /subnet/{net-ip}` | `robot_list_subnets` | id: 2001:db8:: |
| 10 | `GET /subnet/{net-ip}/cancellation` | `robot_list_subnets` | id: 2001:db8::; view: cancellation |
| 11 | `GET /subnet/{net-ip}/mac` | `robot_list_subnets` | id: 2001:db8::; view: mac |
| 12 | `GET /rdns` | `robot_list_rdns` | (none) |
| 13 | `GET /rdns/{ip}` | `robot_list_rdns` | id: 203.0.113.10 |
| 14 | `GET /failover` | `robot_list_failover` | (none) |
| 15 | `GET /failover/{failover-ip}` | `robot_list_failover` | id: 203.0.113.10 |
| 16 | `GET /key` | `robot_list_ssh_keys` | (none) |
| 17 | `GET /key/{fingerprint}` | `robot_list_ssh_keys` | id: 15:28:b0:03:95:f0:77:b3:10:56:15:6b:77:22:a5:bb |
| 18 | `GET /firewall/{server-id}` | `robot_get_firewall` | id: 321 |
| 19 | `GET /firewall/template` | `robot_list_firewall_templates` | (none) |
| 20 | `GET /firewall/template/{template-id}` | `robot_list_firewall_templates` | id: 123 |
| 21 | `GET /boot/{server-number}` | `robot_get_boot` | id: 321 |
| 22 | `GET /boot/{server-number}/rescue` | `robot_get_boot` | id: 321; view: rescue |
| 23 | `GET /boot/{server-number}/rescue/last` | `robot_get_boot` | id: 321; view: rescue_last |
| 24 | `GET /boot/{server-number}/linux` | `robot_get_boot` | id: 321; view: linux |
| 25 | `GET /boot/{server-number}/linux/last` | `robot_get_boot` | id: 321; view: linux_last |
| 26 | `GET /boot/{server-number}/vnc` | `robot_get_boot` | id: 321; view: vnc |
| 27 | `GET /boot/{server-number}/windows` | `robot_get_boot` | id: 321; view: windows |
| 28 | `GET /reset` | `robot_get_reset` | (none) |
| 29 | `GET /reset/{server-number}` | `robot_get_reset` | id: 321 |
| 30 | `GET /wol/{server-number}` | `robot_get_wol` | id: 321 |
| 31 | `GET /vswitch` | `robot_list_vswitches` | (none) |
| 32 | `GET /vswitch/{vswitch-id}` | `robot_list_vswitches` | id: 4321 |
| 33 | `POST /traffic` | `robot_get_traffic` | type: month; from: 2026-09-01; to: 2026-09-30; ip: 203.0.113.10 |
| 34 | `GET /order/server/product` | `robot_list_server_products` | (none) |
| 35 | `GET /order/server/product/{product-id}` | `robot_list_server_products` | id: EX44 |
| 36 | `GET /order/server_market/product` | `robot_list_server_market` | (none) |
| 37 | `GET /order/server_market/product/{product-id}` | `robot_list_server_market` | id: 282323 |
| 38 | `GET /order/server_addon/{server-number}/product` | `robot_list_server_addons` | id: 321 |
| 39 | `GET /order/currency` | `robot_get_order_currency` | (none) |
| 40 | `GET /order/server/transaction` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 41 | `GET /order/server/transaction/{id}` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 42 | `GET /order/server_market/transaction` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 43 | `GET /order/server_market/transaction/{id}` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 44 | `GET /order/server_addon/transaction` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 45 | `GET /order/server_addon/transaction/{id}` | none | left out: order history. Transaction reads can return a new server's root password, and operating servers never needs purchase history |
| 46 | `GET /storagebox` | none | left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API |
| 47 | `GET /storagebox/{storagebox-id}` | none | left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API |
| 48 | `GET /storagebox/{storagebox-id}/snapshot` | none | left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API |
| 49 | `GET /storagebox/{storagebox-id}/snapshotplan` | none | left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API |
| 50 | `GET /storagebox/{storagebox-id}/subaccount` | none | left out: Storage Boxes moved to the Hetzner Console API, and these Robot endpoints only still serve the legacy BX10 type. storagebox_list reads them through the Console API |

Covered: 39. Left out: 11. Total: 50.
