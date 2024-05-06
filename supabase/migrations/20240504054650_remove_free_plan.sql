do
$$
declare
  solo_product_id varchar;
begin
  select stripe_id from plans where name='Solo' into solo_product_id;

  update stripe_info
  set product_id=solo_product_id,
  trial_at=now() + interval '30 days'
  where product_id='free'
  and now() > stripe_info.trial_at;
  
  update stripe_info
  set product_id=solo_product_id
  where product_id='free'
  and now() <= stripe_info.trial_at;
end;
$$;

alter table stripe_info alter column product_id drop default;
