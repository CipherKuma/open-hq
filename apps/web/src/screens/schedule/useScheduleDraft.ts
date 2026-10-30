import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Schedule } from "@open-hq/shared";
import { api } from "../../api";
import { qk, useSchedule } from "../../lib/queries";
import { scheduleErrors } from "./Editors";

// Local draft of the schedule; saving validates with the shared schema, then PUTs.
export function useScheduleDraft() {
  const q = useSchedule();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Schedule | null>(null);
  useEffect(() => { if (q.data && !draft) setDraft(q.data); }, [q.data, draft]);
  const save = useMutation({
    mutationFn: async (s: Schedule) => {
      const parsed = Schedule.safeParse(s);
      if (!parsed.success) throw new Error("Some times are invalid. Check the highlighted blocks.");
      return api.putSchedule(parsed.data);
    },
    onSuccess: (s) => {
      qc.setQueryData(qk.schedule, s);
      setDraft(s);
      void qc.invalidateQueries({ queryKey: qk.workspace });
    },
  });
  const errors = draft ? scheduleErrors(draft) : [];
  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);
  return { q, draft, setDraft, save, errors, dirty, reset: () => q.data && setDraft(q.data) };
}
