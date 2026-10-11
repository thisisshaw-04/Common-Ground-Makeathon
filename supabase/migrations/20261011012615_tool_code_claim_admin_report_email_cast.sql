create or replace function private.get_tool_code_claims_admin()
returns table (
  tool text,
  total_codes bigint,
  claimed_count bigint,
  remaining_count bigint,
  claimant_email text,
  claimed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
     or not (select public.is_current_user_organizer()) then
    raise exception 'Organizer access is required.'
      using errcode = '42501';
  end if;

  return query
  select
    inventory_summary.tool,
    inventory_summary.total_codes,
    inventory_summary.claimed_count,
    inventory_summary.total_codes - inventory_summary.claimed_count,
    user_record.email::text,
    tool_claim.claimed_at
  from (
    select
      inventory.tool,
      pg_catalog.count(*)::bigint as total_codes,
      pg_catalog.count(*) filter (where inventory.claimed_by is not null)::bigint
        as claimed_count
    from private.tool_code_inventory as inventory
    group by inventory.tool
  ) as inventory_summary
  left join private.tool_code_inventory as tool_claim
    on tool_claim.tool = inventory_summary.tool
    and tool_claim.claimed_by is not null
  left join auth.users as user_record
    on user_record.id = tool_claim.claimed_by
  order by
    inventory_summary.tool,
    tool_claim.claimed_at,
    user_record.email;
end;
$function$;

revoke all on function private.get_tool_code_claims_admin()
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.get_tool_code_claims_admin()
  to authenticated;
