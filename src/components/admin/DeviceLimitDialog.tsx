"use client";

import { useState } from "react";
import type { License } from "@/types";
import { Button } from "@/components/ui/Button";
import { CheckboxField, TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/utils";
import { runLicenseCommand } from "@/services/licenseService";

/**
 * Sets how many devices may use one licence: follow the plan's tills, or any number from 1 to 1000. Takes effect at each PC's next
 * check (within about 3 minutes). Shared by the Licences page and the Devices page so both behave identically.
 */
export function DeviceLimitDialog({ license, currentLimit, planTills, subtitle, onClose, onSaved }: {
  license: License; currentLimit: number; planTills: number; subtitle: string; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [follow, setFollow] = useState(license.deviceLimit === null);
  const [value, setValue] = useState(String(currentLimit));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = Number(value);
    if (!follow && (!Number.isInteger(n) || n < 1 || n > 1000)) return toast.error("Enter a whole number from 1 to 1000.");
    setBusy(true);
    try {
      await runLicenseCommand({ action: "set_device_limit", licenseId: license.id, deviceLimit: follow ? null : n });
      toast.success("Device limit saved.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Device limit" description={subtitle} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="dark" loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <CheckboxField label={`Follow the plan (${planTills} till${planTills === 1 ? "" : "s"})`} description="The limit tracks the number of tills the customer pays for, and changes by itself when they upgrade." checked={follow} onChange={(e) => setFollow(e.target.checked)} />
        <TextField label="Maximum devices on this licence" type="number" min={1} max={1000} inputMode="numeric" disabled={follow} value={value} onChange={(e) => setValue(e.target.value)} data-autofocus
          hint="A device is one PC running the POS (the shop's server or a till). Takes effect at each PC's next check. If it is lower than the PCs in use, the newest ones are blocked." />
      </div>
    </Modal>
  );
}
