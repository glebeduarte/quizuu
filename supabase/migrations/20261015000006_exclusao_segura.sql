-- Quizuu · apagar pergunta ou opção não quebra partidas já jogadas
alter table public.sessions drop constraint sessions_current_question_id_fkey;
alter table public.sessions add constraint sessions_current_question_id_fkey
  foreign key (current_question_id) references public.questions(id) on delete set null;
alter table public.answers drop constraint answers_option_id_fkey;
alter table public.answers add constraint answers_option_id_fkey
  foreign key (option_id) references public.options(id) on delete set null;

-- Posições checadas só no fim do comando: permite reordenar num único salvamento
alter table public.questions drop constraint questions_quiz_id_position_key;
alter table public.questions add constraint questions_quiz_id_position_key unique (quiz_id, position) deferrable initially immediate;
alter table public.options drop constraint options_question_id_position_key;
alter table public.options add constraint options_question_id_position_key unique (question_id, position) deferrable initially immediate;
