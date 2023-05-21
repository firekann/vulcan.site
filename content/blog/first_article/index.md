---
title: 블로그 첫 글
date: "2023-05-21T00:00:00Z"
description: "테스트를 위한 첫 글"
tags: ["server", "homeserver"]
---

-   Dashboard : [Grafana](https://grafana.vulcan.site/d/lddZaVA4z/main?orgId=3&refresh=10s&kiosk)
-   하드웨어
    | Type | Name | Q'ty |
    | :----- | :--------------------------------------- | :--- |
    | CPU | Intel(R) Xeon(R) CPU E5-2696 v4 @ 2.20GHz | 2ea(2 Sockets) |
    | RAM | SAMSUNG DDR4-3200 ECC/REG (32GB) | 8ea |
    | MAINBOARD | HUANANZHI- F8D PLUS | 1ea |
    | SSD | SK hynix GOLD P31 NVMe 2TB | 2ea(ZFS MIRROR) |
    | | SK hynix GOLD P31 NVMe 500GB | 2ea(ZFS STRIPE) |
    | GPU | NVIDIA® QUADRO® P4000 | 1ea |
    | NET card | RTL8125B 2.5G quad port NETWORK adapter | 1ea |
    | | Chelsio T540-CR Quad Port SFP+ 10GbE | 1ea |
    | | Mellanox MCX354A-FCBT CONNECTX-3 | 1ea |
    | HBA card | LSI 9207-8i 6Gbs SAS HBA P20 | 1ea |
    | HDD | Seagate 14TB HDD Exos X16 ST14000NM001G 14T SATA 6 Gb/s 7200RPM | 8ea(6ea ZFS RAIDZ2, 2ea spare) |
    | CASE | Fractal Design Define 7 XL Black | 1ea |
    | CPU cooler | DEEPCOOL AG620 | 2ea |
    | POWER | Seasonic FOCUS GOLD GM-750 Modular | 1ea |
    | UPS | BX1600MI-GR | 1ea |

-   Virtual Machine

    -   Hypervisor & Host OS : PROXMOX
    -   Fierwall & Router : pfsense
    -   Proxy : HA Proxy
    -   VPN : OpenVPN
    -   DNS Resolver : unbound
    -   Local DNS : Pi-hole
    -   NAS : TureNAS Scale
    -   Cloud : Nextcloud
    -   Media Stream : Plex
    -   UPS control : NUT server
    -   Monitoring : Grafana(lm-sensors, Telegraf, InfluxDB, Prometheus, Tautulli)
    -   Stable Diffusion Webui

-   Container
    -   blog
