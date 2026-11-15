-- FiveOps: extended server audit for Viseu RP (Sky/ESX/ox_inventory).
-- This resource only OBSERVES events. It never grants permissions or changes gameplay.
-- txAdmin events are server-side; do not expose these handlers with RegisterNetEvent.
local RESOURCE = GetCurrentResourceName()
local function enabled(convar, defaultValue)
    return GetConvar(convar, defaultValue and "true" or "false") == "true"
end

local function write(eventType, category, payload, src)
    local ok, err = pcall(function()
        exports[RESOURCE]:logEvent(eventType, category, payload or {}, tonumber(src))
    end)
    if not ok then print(("[FiveOps] Failed audit %s: %s"):format(tostring(eventType), tostring(err))) end
end

local function short(value, limit)
    if value == nil then return nil end
    local str = tostring(value)
    return str:sub(1, limit or 255)
end

-- Never capture secrets, passwords, arbitrary console input or private conversations.
local function sanitizedCommand(text)
    if type(text) ~= "string" then return nil end
    local command = text:match("^%s*/?([%w_%-:]+)")
    if not command then return nil end
    command = command:lower():sub(1, 80)
    local sensitive = {
        password = true, passwd = true, login = true, register = true,
        setpassword = true, set = true, setr = true, sets = true, setsv = true,
        rcon_password = true, sv_licensekey = true, exec = true,
        add_ace = true, add_principal = true, remove_principal = true
    }
    local arguments = nil
    if not sensitive[command] and enabled('fiveops_log_command_arguments', false) then
        arguments = text:match("^%s*/?[%w_%-:]+%s+(.+)$")
        if arguments and arguments:lower():match("token%s*=") then arguments = "[redacted]" end
        if arguments and arguments:lower():match("password%s*=") then arguments = "[redacted]" end
        if arguments and arguments:lower():match("key%s*=") then arguments = "[redacted]" end
        if arguments and arguments:lower():match("secret%s*=") then arguments = "[redacted]" end
        arguments = short(arguments, 300)
    end
    return command, arguments
end

local defaultStaffCommands = table.concat({
    'admin','staff','noclip','godmode','vanish','freeze','unfreeze',
    'kick','ban','unban','warn','unwarn','revive','heal','reviveall',
    'goto','bring','tp','tpm','teleport','setcoords','car','vehicle','dv',
    'fix','repair','setjob','setgroup','group','giveitem','removeitem',
    'clearinventory','giveweapon','removeweapon','giveaccountmoney',
    'setaccountmoney','setmoney','addmoney','money','setskin','skin',
    'spectate','announce','announcement','cleararea','setped','setmodel',
    'givecar','delcar','spawncar','givevehicle','staffduty','aduty'
}, ',')

local watchedCommands = {}
for value in (GetConvar('fiveops_staff_commands', defaultStaffCommands) .. ','):gmatch('([^,]+),') do
    local name = value:match('^%s*(.-)%s*$'):lower()
    if name ~= '' then watchedCommands[name] = true end
end

if enabled('fiveops_audit_chat_commands', true) then
    -- Captures commands submitted via standard chat, NOT their execution or outcome.
    -- Commands submitted through F8 or custom NUI menus require instrumenting that script.
    AddEventHandler('chatMessage', function(playerId, author, message)
        if tonumber(playerId) == nil or tonumber(playerId) <= 0 then return end
        if type(message) ~= 'string' then return end
        local cmd, args = sanitizedCommand(message)
        if message:match('^%s*/') and cmd and watchedCommands[cmd] then
            write('staff_command_attempted', 'staff', {
                command = cmd,
                arguments = args,
                status = 'observed_in_chat',
                source = 'chat',
                message = 'Command submitted via chat; execution is not confirmed'
            }, playerId)
        elseif enabled('fiveops_log_public_chat', false) and not message:match('^%s*/') then
            write('chat_message', 'chat', { message = short(message, 500), source = 'chat' }, playerId)
        end
    end)
end

-- Connection attempts: not an access-control signal. No IP addresses are collected.
AddEventHandler('playerConnecting', function(playerName)
    local playerId = source
    write('player_connecting', 'player', { playerName = short(playerName, 100) }, playerId)
end)

local function txEvent(eventName, eventType, extractor)
    AddEventHandler('txAdmin:events:' .. eventName, function(data)
        local payload = {}
        if type(data) == 'table' then
            payload = extractor(data)
        end
        payload.source = 'txAdmin'
        write(eventType, 'txadmin', payload)
    end)
end

txEvent('consoleCommand', 'tx_console_command', function(d)
    local command, args = sanitizedCommand(d.command)
    return { author = short(d.author, 100), command = command, arguments = args,
             channel = short(d.channel, 50) }
end)

txEvent('playerHealed', 'tx_player_healed', function(d)
    return { author = short(d.author, 100), targetPlayerId = tonumber(d.target) or -1,
             everyone = tonumber(d.target) == -1 }
end)

txEvent('whitelistPlayer', 'tx_whitelist_player', function(d)
    return { action = short(d.action, 40), author = short(d.adminName, 100),
             targetName = short(d.playerName, 100), targetLicense = short(d.license, 160) }
end)

txEvent('whitelistPreApproval', 'tx_whitelist_preapproval', function(d)
    return { action = short(d.action, 40), author = short(d.adminName, 100),
             targetName = short(d.playerName, 100), targetIdentifier = short(d.identifier, 160) }
end)

txEvent('whitelistRequest', 'tx_whitelist_request', function(d)
    return { action = short(d.action, 40), author = short(d.adminName, 100),
             targetName = short(d.playerName, 100), requestId = short(d.requestId, 50) }
end)

txEvent('adminAuth', 'tx_admin_auth', function(d)
    return { author = short(d.username, 100), targetPlayerId = tonumber(d.netid),
             isAdmin = d.isAdmin == true }
end)

AddEventHandler('txAdmin:events:adminsUpdated', function()
    write('tx_admins_updated', 'security', {
        message = 'Admin or permissions list changed in txAdmin; see txAdmin audit file for details',
        source = 'txAdmin'
    })
end)

AddEventHandler('txAdmin:events:configChanged', function()
    write('tx_config_changed', 'security', {
        message = 'txAdmin configuration changed',
        source = 'txAdmin'
    })
end)

AddEventHandler('txAdmin:events:scheduledRestart', function(data)
    if type(data) ~= 'table' then return end
    local seconds = tonumber(data.secondsRemaining)
    if seconds ~= 60 and seconds ~= 10 and seconds ~= 0 then return end
    write('tx_scheduled_restart', 'resource', { secondsRemaining = seconds, source = 'txAdmin' })
end)

AddEventHandler('txAdmin:events:scheduledRestartSkipped', function(data)
    write('tx_restart_skipped', 'resource', { source = 'txAdmin' })
end)

-- Standard OneSync game events; these are observations, not anti-cheat verdicts.
local lastEvent = {}
local function limited(playerId, eventName, interval)
    local key = tostring(playerId) .. ':' .. eventName
    local now = GetGameTimer()
    local last = lastEvent[key]
    if last and now - last < interval then return true end
    lastEvent[key] = now
    return false
end

if enabled('fiveops_log_explosions', true) then
    AddEventHandler('explosionEvent', function(sender, data)
        if type(data) ~= 'table' or limited(sender, 'explosion', 350) then return end
        write('explosion_detected', 'combat', {
            explosionType = tonumber(data.explosionType), damageScale = tonumber(data.damageScale),
            x = tonumber(data.posX), y = tonumber(data.posY), z = tonumber(data.posZ),
            isInvisible = data.isInvisible == true, source = 'game_event'
        }, sender)
    end)
end

if enabled('fiveops_log_lethal_damage', true) then
    AddEventHandler('weaponDamageEvent', function(sender, data)
        if type(data) ~= 'table' or data.willKill ~= true or
           limited(sender, 'lethal_damage', 1000) then return end
        write('lethal_damage_attempted', 'combat', {
            weaponName = short(data.weaponType), hitEntityId = tonumber(data.hitGlobalId),
            damageType = tonumber(data.damageType), source = 'game_event',
            message = 'Predicted lethal damage, not a confirmed kill'
        }, sender)
    end)
end

if enabled('fiveops_log_vehicle_entities', true) then
    AddEventHandler('entityCreated', function(entity)
        if not DoesEntityExist(entity) or GetEntityType(entity) ~= 2 then return end
        local owner, model
        local ok = pcall(function()
            owner = NetworkGetEntityOwner(entity)
            model = GetEntityModel(entity)
        end)
        if not ok then return end
        if not owner or owner <= 0 then return end
        if limited(owner, 'vehicle_entity', 700) then return end
        write('vehicle_entity_created', 'vehicle', {
            vehicleName = tostring(model), modelHash = tostring(model),
            source = 'entityCreated', message = 'Entity observed, not necessarily a staff spawn'
        }, owner)
    end)
end

-- Optional Ox Inventory post-hooks. Only record completed actions when supported.
-- These callbacks never cancel/modify transactions and don't touch inventory state.
local oxAttached = false
local function attachInventoryHooks()
    if oxAttached or GetResourceState('ox_inventory') ~= 'started' then return end
    local definitions = {
        { hook = 'createItem', event = 'item_created', extractor = function(p)
            return { itemName = type(p.item) == 'table' and short(p.item.name) or short(p.item),
                     count = tonumber(p.count), inventoryId = short(p.inventoryId),
                     action = 'create', source = 'ox_inventory' }
        end },
        { hook = 'craftItem', event = 'item_crafted', extractor = function(p)
            return { itemName = type(p.recipe) == 'table' and short(p.recipe.name) or nil,
                     count = type(p.recipe) == 'table' and tonumber(p.recipe.count) or nil,
                     benchId = short(p.benchId), source = 'ox_inventory' }
        end }
    }
    local attached = 0
    for _, def in ipairs(definitions) do
        local ok, hookId = pcall(function()
            return exports.ox_inventory:registerHook(def.hook, nil, {})
        end)
        if ok and type(hookId) == 'string' then
            AddEventHandler(hookId, function(success, payload)
                if not success or type(payload) ~= 'table' then return end
                local data = def.extractor(payload)
                local playerId = tonumber(payload.source) or tonumber(payload.inventoryId)
                write(def.event, 'inventory', data, playerId)
            end)
            attached = attached + 1
        else
            print(('[FiveOps] ox_inventory posthook unavailable: %s'):format(def.hook))
        end
    end
    oxAttached = attached == #definitions
end

AddEventHandler('onServerResourceStart', function(resourceName)
    if resourceName == RESOURCE or resourceName == 'ox_inventory' then
        SetTimeout(1000, attachInventoryHooks)
    end
end)
AddEventHandler('onServerResourceStop', function(resourceName)
    if resourceName == 'ox_inventory' then oxAttached = false end
end)
SetTimeout(1500, attachInventoryHooks)

-- Generic server exports are the supported way to audit completed actions in
-- encrypted/third-party Sky scripts, ESX commands and custom administration menus.
-- Call these FROM A SERVER SCRIPT after success, never from an untrusted client event.
exports('logStaffAction', function(adminId, action, targetId, details)
    if type(action) ~= 'string' or action == '' then return end
    write('staff_action', 'staff', {
        action = short(action, 80), targetPlayerId = tonumber(targetId),
        details = short(details, 300), status = 'completed',
        source = 'script_integration'
    }, adminId)
end)

exports('logEconomyAction', function(playerId, action, amount, account, targetId)
    if type(action) ~= 'string' or not tonumber(amount) then return end
    write('economy_transaction', 'economy', {
        action = short(action, 80), amount = tonumber(amount),
        account = short(account, 40), targetPlayerId = tonumber(targetId),
        source = 'script_integration'
    }, playerId)
end)

exports('logJobAction', function(playerId, action, job, grade, targetId)
    if type(action) ~= 'string' then return end
    write('job_changed', 'job', {
        action = short(action, 80), job = short(job, 80),
        grade = tonumber(grade), targetPlayerId = tonumber(targetId),
        source = 'script_integration'
    }, playerId)
end)

exports('logVehicleAction', function(playerId, action, plate, model, targetId)
    if type(action) ~= 'string' then return end
    write('vehicle_action', 'vehicle', {
        action = short(action, 80), plate = short(plate, 32),
        vehicleName = short(model, 100), targetPlayerId = tonumber(targetId),
        source = 'script_integration'
    }, playerId)
end)

print('[FiveOps] Advanced audit enabled: txAdmin, staff chat commands, inventory, combat and vehicles.')
