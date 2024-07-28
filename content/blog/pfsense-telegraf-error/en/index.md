---
title: How to Resolve Telegraf Errors After Upgrading to pfSense 2.7
date: "2024-07-28T00:00:00Z"
description: "pfSense Telegraf Error"
tags: ["server", "pfSense", "error"]
---

-   This article was automatically translated using GPT. There may be some inaccuracies in the translation.

# 1 Error

After upgrading from pfSense CE version 2.6 to version 2.7, I encountered the following error repeatedly:

```
PHP Fatal error: Uncaught TypeError: implode(): Argument #1 ($pieces) must be of type array, string given in /usr/local/pkg/telegraf.inc:132
Stack trace:
#0 /usr/local/pkg/telegraf.inc(132): implode(',', NULL)
#1 /etc/inc/pkg-utils.inc(709) : eval()'d code(1): telegraf_resync_config()
#2 /etc/inc/pkg-utils.inc(709): eval()
#3 /etc/rc.start_packages(66): sync_package('Telegraf')
#4 {main}
thrown in /usr/local/pkg/telegraf.inc on line 132
```

I noticed that this error caused the disappearance of the Telegraf option under Services in the GUI, which is used to manage telegraf settings. Telegraf is responsible for sending collected information from pfSense to the database. When this error occurs, telegraf stops working. Although deleting telegraf, restarting pfSense, and reinstalling telegraf allows it to work with previous settings, the error persists and the GUI access remains unavailable.

# 2 Why Did This Error Occur?

## 2.1 The Code That Causes the Error

The error occurs in the `telegraf.inc` file, which is responsible for resynchronizing the configuration settings in `/usr/local/etc/telegraf.conf`. This code runs when telegraf settings are changed via the GUI or when telegraf is reinstalled.

Let's examine the code where the error occurs:

```PHP
//      /usr/local/pkg/telegraf.inc
        /* Ping Monitor Configuration */
        if ($telegraf_conf["ping_enable"]) {
                if (!empty($telegraf_conf['ping_host_1'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_1"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_2'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_2"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_3'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_3'] . '"';
                }
                if (!empty($telegraf_conf['ping_host_4'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_4'] . '"';
                }

                $monitor_hosts = implode(",", $monitor_hosts);      // line 132

                $cfg .= "\n[[inputs.ping]]\n";
                $cfg .= "\turls = [" . $monitor_hosts . "]";
                $cfg .= "\n\tdeadline = 0\n\n"; /* deadline (-w) function not supported in BSD ping */
        }
```

The code tries to construct a configuration for telegraf's ping monitor as follows:

```
[[inputs.ping]]
	urls = ["host.1.ip.addr","host.2.ip.addr","host.3.ip.addr","host.4.ip.addr"]
	deadline = 0
```

This enables telegraf to ping specified IPs and check if the target servers are alive. However, this feature is optional and can be disabled in the pfSense telegraf settings.

## 2.2 Where the Error Occurs

The error message indicates that line 132 in `telegraf.inc` causes the error because `implode(',', NULL)` is invalid. This happens because `$monitor_hosts` is `NULL`. If the `ping_host_*` values in `$telegraf_conf` are empty, `$monitor_hosts` remains unset or `NULL`. In PHP, a variable that is not explicitly initialized can be `NULL`, and PHP 8 does not allow `implode` to be called with a `NULL` value.

## 2.3 Why Did This Error Occur After the Upgrade?

The upgrade notes for pfSense CE 2.7 indicate that PHP was upgraded from version 7.4.X to 8.2.6. In PHP 7, calling `implode` with a `NULL` value was allowed, but in PHP 8, stricter type checking causes an error. Hence, upgrading pfSense caused this issue due to the new PHP version.

## 2.4 Why Was This Not Prevented?

Telegraf works even if `urls` is empty. The `telegraf/plugins/inputs/ping/ping.go` file handles this scenario gracefully:

```go
func (p *Ping) Gather(acc telegraf.Accumulator) error {
	for _, host := range p.Urls {
		p.wg.Add(1)
		go func(host string) {
			defer p.wg.Done()

			switch p.Method {
			case "native":
				p.pingToURLNative(host, acc)
			default:
				p.pingToURL(host, acc)
			}
		}(host)
	}

	p.wg.Wait()

	return nil
}
```

If `p.Urls` is empty, no ping operations are performed, and there are no issues.

Currently, enabling the Ping Monitor option and saving without any Ping Host values results in a crash report:

```
PHP Fatal error:  Uncaught TypeError: implode(): Argument #1 ($array) must be of type array, string given in /usr/local/pkg/telegraf.inc:132
Stack trace:
#0 /usr/local/pkg/telegraf.inc(132): implode()
#1 /usr/local/www/pkg_edit.PHP(245) : eval()'d code(1): telegraf_resync_config()
#2 /usr/local/www/pkg_edit.PHP(245): eval()
#3 {main}
  thrown in /usr/local/pkg/telegraf.inc on line 132
```

However, pfSense does not validate this condition when saving the settings, resulting in the error only in pfSense CE 2.7 and later versions.

# 3 How to Fix It

## 3.1 Add an IP to Ping Host

Since the error is caused by an empty `Ping Host`, adding at least one IP address to the `Ping Host` will fix it. Without GUI access, this can be done by editing `/conf/config.xml` and adding an IP address under `<ping_host_1>`:

```xml
<ping_host_1>db.server.ip.addr</ping_host_1>
```

## 3.2 Disable Ping Monitor Option

Disabling the Ping Monitor option will also prevent the error. This can be done by editing `/conf/config.xml` and removing the `<ping_enable>on</ping_enable>` entry.

## 3.3 Modify telegraf.inc

Initially, modifying `telegraf.inc` seemed like a solution, but this file is re-fetched from the server during package reinstallation or pfSense reboot, making changes non-permanent. However, for a temporary fix, the following modification can be made:

```PHP
        /* Ping Monitor Configuration */
        if ($telegraf_conf["ping_enable"]) {
                $monitor_hosts = array();
                if (!empty($telegraf_conf['ping_host_1'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_1"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_2'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_2"] . '"';
                }
                if (!empty($telegraf_conf['ping_host_3'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_3'] . '"';
                }
                if (!empty($telegraf_conf['ping_host_4'])) {
                        $monitor_hosts[] = '"' . $telegraf_conf["ping_host_4'] . '"';
                }

                if (!empty($monitor_hosts)) {
                    $monitor_hosts = implode(",", $monitor_hosts);      // line 132

                    $cfg .= "\n[[inputs.ping]]\n";
                    $cfg .= "\turls = [" . $monitor_hosts . "]";
                    $cfg .= "\n\tdeadline = 0\n\n"; /* deadline (-w) function not supported in BSD ping */
                }
        }
```

This code initializes `$monitor_hosts` as an array and checks if it is not empty before calling `implode`.

I discovered that this issue is already fixed in the pfSense package repository, and the fix will be included in pfSense CE 2.8.0 and pfSense Plus 24.08.

# Conclusion

This issue has been reported since the release of pfSense CE 2.7. Although there was no clear solution for a long time, I hope this post helps others resolve the error.

Feel free to point out any errors or suggest improvements.

# References

-   [telegraf inputs.ping](https://github.com/influxdata/telegraf/tree/master/plugins/inputs/ping)
-   [PHP implode](https://www.PHP.net/manual/en/function.implode.PHP)
-   [PHP manual Backward Incompatible Changes](https://www.PHP.net/manual/en/migration80.incompatible.PHP)
-   [pfSense CE 2.7 upgrade note](https://docs.netgate.com/pfSense/en/latest/releases/2-7-0.html)
-   [pfSense issues](https://redmine.pfSense.org/issues/14861)
