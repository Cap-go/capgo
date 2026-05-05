DROP POLICY IF EXISTS "Allow users to delete manifest entries" ON "public"."manifest";
DROP POLICY IF EXISTS "Allow users to insert manifest entries" ON "public"."manifest";

CREATE POLICY "Prevent users from inserting manifest entries" ON "public"."manifest"
AS RESTRICTIVE
FOR INSERT
TO "authenticated", "anon"
WITH CHECK (false);

CREATE POLICY "Prevent users from deleting manifest entries" ON "public"."manifest"
AS RESTRICTIVE
FOR DELETE
TO "authenticated", "anon"
USING (false);
