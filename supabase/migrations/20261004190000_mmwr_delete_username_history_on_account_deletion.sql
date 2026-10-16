-- The Owner-approved account-deletion policy removes historical usernames
-- together with the Auth identity so deleted account names are not retained.
alter table private.username_history
  drop constraint username_history_user_id_fkey;

alter table private.username_history
  add constraint username_history_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
