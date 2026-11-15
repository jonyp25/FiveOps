# FiveOps — Auditoria avançada para Viseu RP (Sky/ESX)

O recurso `fivem-logger` foi ampliado sem alterar a base de dados MySQL nem apagar o índice Elasticsearch.
Instale **os três ficheiros** `fxmanifest.lua`, `server.lua` e `advanced.lua` da mesma versão.

## Eventos automáticos

| Categoria | Exemplos | Fonte e limitações |
|---|---|---|
| player | player_connecting, player_joining, player_dropped | Servidor FiveM; não recolhe IP |
| staff | staff_command_attempted | Comandos da lista enviados pelo chat padrão; **não prova execução** |
| txadmin | tx_console_command, tx_player_healed, tx_whitelist_player, tx_whitelist_preapproval, tx_whitelist_request, tx_admin_auth | Eventos oficiais broadcast pelo txAdmin |
| security | tx_admins_updated, tx_config_changed | Alterações gerais, sem expor configurações ou credenciais |
| inventory | item_swapped, item_bought, item_created, item_crafted | Hooks ox_inventory; create/craft via post-hook quando suportado |
| combat | player_killed, player_died, explosion_detected, lethal_damage_attempted | Notificação de jogo, algumas previsões são apenas indícios |
| vehicle | vehicle_spawned, vehicle_entity_created | Veículos criados no jogo, nem todos são spawns da staff |
| resource | resource_start, resource_stop, tx_scheduled_restart, tx_restart_skipped | Eventos dos recursos e do txAdmin |
| chat | chat_message (opcional) | Chat público, desativado por defeito para privacidade |
| economy, job | economy_transaction, job_changed | Só depois de integrar os scripts responsáveis |

Os logs de txAdmin nem sempre são recebidos pelo recurso quando o servidor está offline.
Para auditoria completa de tarefas offline, utilizar também os registos nativos do txAdmin.

## Instalação

1. Copiar os três ficheiros atualizados para `resources/[local]/fivem-logger/` (ou a pasta atual do recurso).
2. Manter os convars existentes `fiveops_backend_url` (apontando para `http://127.0.0.1:3000/log` se FiveOps e FXServer estiverem na mesma VPS) e `fiveops_ingest_key` como já estão configurados. **Não colocar a chave em documentação ou GitHub.**
3. Garantir `ensure baseevents`, `ensure ox_inventory` e, depois, `ensure fivem-logger` no `server.cfg`. A ordem ajuda os hooks a iniciarem.
4. Executar na consola do FiveM: `restart fivem-logger` (com o nome real da pasta).
5. Testar um comando de chat de staff, uma movimentação de item e uma ação de txAdmin. Confirmar em `/logs` no painel.

Se o recurso foi renomeado, mudar também o nome `fivem-logger` nos exports abaixo.

## Convars opcionais no server.cfg

```cfg
set fiveops_audit_chat_commands "true"
set fiveops_log_command_arguments "false"
set fiveops_log_public_chat "false"
set fiveops_log_explosions "true"
set fiveops_log_lethal_damage "true"
set fiveops_log_vehicle_entities "true"
# Editar a lista para adicionar comandos do menu Sky e da sua staff:
set fiveops_staff_commands "admin,staff,noclip,godmode,kick,ban,warn,revive,heal,bring,goto,tp,tpm,dv,car,fix,setjob,setgroup,giveitem,removeitem,giveaccountmoney,setaccountmoney,clearinventory,spectate,announce"
```

Por segurança, argumentos de comandos são omitidos por defeito. Comandos que possam conter palavras-passe, variáveis do servidor ou outros segredos nunca expõem argumentos; **não ativar** recolha indiscriminada em servidores com dados sensíveis.

## Ações reais dos scripts Sky, ESX e menus administrativos

O FiveM **não fornece um evento global fiável de execução bem-sucedida de todos os comandos** de todos os recursos. Para um comando de staff executado por F8, menus NUI ou scripts encriptados, inserir o log no **código server-side da ação, após ela ser validada e concluída**, ou solicitar essa integração ao autor do script. Não inventar eventos chamados diretamente pelo cliente para simular auditoria.

```lua
-- Exemplos dentro do script de administração no servidor (não no client)
exports['fivem-logger']:logStaffAction(adminSource, 'setjob', targetId, 'gnr:3')
exports['fivem-logger']:logStaffAction(adminSource, 'revive', targetId, 'Reviver jogador')
exports['fivem-logger']:logStaffAction(adminSource, 'giveitem', targetId, 'WEAPON_PISTOL x1')

-- Economia / transações executadas com sucesso
exports['fivem-logger']:logEconomyAction(playerSource, 'bank_transfer', 500, 'bank', targetId)
exports['fivem-logger']:logEconomyAction(adminSource, 'admin_give_money', 2000, 'money', targetId)

-- Alterações de cargo e salário
exports['fivem-logger']:logJobAction(adminSource, 'setjob', 'gnr', 3, targetId)

-- Veículos: criação, eliminação, reparação, garagens e stand
exports['fivem-logger']:logVehicleAction(adminSource, 'vehicle_spawn', 'AA-00-BB', 'police', targetId)

-- Evento adicional: export genérico SERVER-SIDE do núcleo FiveOps
exports['fivem-logger']:logEvent('fine_issued', 'economy', {
    action = 'fine', amount = 120, targetPlayerId = targetId
}, adminSource)
```

Todos os exemplos acima só devem ser chamados **após** o sucesso da operação. Regras de permissões continuam no próprio recurso de origem; o FiveOps apenas observa.

### Prioridade de integração na Sky

- **Sky jobs_base / jobcreator:** promoções, despromoções, contratação, despedimento, duty e alterações de cargos
- **Sky policejob:** multas, apreensões, algemas, detenção, mandados e armazenamento de provas
- **Sky ambulancejob / firejob:** reviver, tratamentos, dispatch e operações relevantes
- **Sky mechanic / stand / cd_garage:** criar, vender, transferir, modificar, rebocar, guardar ou eliminar viaturas
- **ESX e banco:** alteração de dinheiro, transferências, levantamentos, depósitos e faturas
- **Menus staff não-txAdmin:** dar itens/armas/dinheiro, setjob, banir, expulsar, TP, invisibilidade, noclip, veículos

Para scripts **encriptados** sem API/evento de auditoria documentado, não é possível garantir estes logs sem apoio do fornecedor.

## Confirmação / prevenção de erros

- Ao registar **tentativas** de comandos, o campo `status` é `observed_in_chat`; só os exports chamados após sucesso registam `completed`.
- Evitar recolher palavras-passe, tokens, conteúdo de mensagens privadas, endereços IP, dados pessoais não necessários e metadata completa de itens.
- Alguns eventos de combate enviados por clientes podem ser incorretos ou manipulados: não usar isoladamente para banimentos.
- O evento `payload.source` nos logs antigos é numérico; os novos logs usam `payload.origin` (texto) para evitar conflitos do Elasticsearch.
- Em `/logs`, filtrar pelas categorias `staff`, `txadmin`, `security`, `economy`, `job`, `inventory`, `vehicle`.
