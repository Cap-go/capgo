CREATE POLICY "INSERT into job_queue" ON "job_queue" FOR INSERT TO "authenticated" WITH CHECK (true);
CREATE POLICY "SELECT into job_queue" ON "job_queue" FOR SELECT TO "authenticated";
CREATE POLICY "DELETE into job_queue" ON "job_queue" FOR DELETE TO "authenticated";
