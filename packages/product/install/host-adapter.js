// install/host-adapter.js — Abstract base class for host adapters.
//
// Each adapter describes "what this host looks like" without knowing about
// other hosts. The dispatcher (install/main.js) invokes polymorphic methods;
// no switch-case on tool names.
//
// Static methods (not instance methods): installation is a one-shot script
// action with no multi-instance scenario. If a future use case requires
// instance state (e.g., multiple profiles per host), convert to instance
// methods at that point — YAGNI for now.

export class HostAdapter {
  /** Host identifier — used in CLI args, sentinel filenames, logs. */
  static id = "abstract";

  /** Human-readable name — used in error messages and announce output. */
  static displayName = "Abstract Host";

  /**
   * Detect whether this host is installed on the current machine.
   * Used by `detectDefault()` to pick the tool when --tool is not specified.
   * @returns {boolean}
   */
  static isInstalled() { return false; }

  /**
   * Describe this host's installation-plan facts without changing the host.
   * Adapters with installation requirements override this method.
   * @param {{PACKAGE_ROOT: string, announce?: (msg: string) => void}} ctx
   * @returns {{
   *   id: string,
   *   display_name: string,
   *   detected: boolean,
   *   dependencies: Array,
   *   capabilities: Array,
   *   resources: Array,
   *   risks: Array,
   *   recommendation: {action: string, reason: string}
   * }}
   */
  static describe(ctx) {
    return {
      id: this.id,
      display_name: this.displayName,
      detected: this.isInstalled(),
      dependencies: [],
      capabilities: [],
      resources: [],
      risks: [],
      recommendation: {
        action: "skip",
        reason: "adapter has no plan facts",
      },
    };
  }

  /**
   * Pre-flight checks (CLI deps, IDE presence, etc.).
   * Non-blocking: print warnings to ctx.announce, do not throw.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static preflight(ctx) {}

  /**
   * Apply an individual resource step.
   * @param {object} resource
   * @param {object} ctx
   * @returns {Promise<{status?: string, message?: string, owned?: boolean}>}
   */
  static async applyResource(resource, ctx) {
    return { status: "succeeded", owned: resource?.owned !== false };
  }

  /**
   * Execute installation.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static async install(ctx) {
    throw new Error(`${this.displayName}: install() not implemented`);
  }

  /**
   * Execute uninstallation. Must be idempotent (repeat calls do not error).
   * OPTIONAL — default is no-op. Adapters that need cleanup override this.
   * @param {{PACKAGE_ROOT: string, announce: (msg: string) => void}} ctx
   */
  static async uninstall(ctx) {}
}
