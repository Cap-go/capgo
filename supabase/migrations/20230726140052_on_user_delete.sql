--
-- Name: users on_user_create; Type: TRIGGER; Schema: public; Owner: supabase_admin
--

CREATE TRIGGER on_user_create AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('http://localhost:54321/functions/v1/on_user_delete', 'POST', '{"Content-type":"application/json","apisecret":"Y3p63TMDGNTHTze6MchBM7tPmB5"}', '{}', '1000');
