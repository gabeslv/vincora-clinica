# Checklist de segurança antes de usar dados reais

## Supabase
- [ ] RLS habilitado para cada tabela privada.
- [ ] Testes com usuário anônimo e usuário autenticado.
- [ ] Testes de isolamento entre duas contas diferentes.
- [ ] Signup público desativado após criar a conta necessária.
- [ ] MFA e recuperação de conta revisados.
- [ ] Chave `service_role` nunca disponibilizada no browser.
- [ ] Backups configurados e restauração testada.
- [ ] Storage privado; políticas de leitura/escrita testadas.
- [ ] Logs e políticas de retenção revisados.

## Aplicação
- [ ] Nenhum dado real em fixtures, console ou analytics.
- [ ] Mensagens de erro não revelam conteúdo clínico.
- [ ] Sessão expira/é encerrada corretamente em dispositivos compartilhados.
- [ ] Proteção contra XSS: evitar HTML arbitrário em notas.
- [ ] Política de segurança de conteúdo e HTTPS revisados.
- [ ] Exportação e exclusão de dados testadas.
- [ ] Termos de uso, aviso de privacidade e processo para incidentes definidos.

## Operação
- [ ] A profissional entende o backup e a recuperação.
- [ ] Plano de contingência para indisponibilidade do serviço.
- [ ] Requisitos da LGPD e sigilo profissional revisados.
- [ ] IA não processa dados clínicos sem avaliação de privacidade e consentimento aplicável.
