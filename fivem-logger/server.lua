-- fivem-logging.lua
-- Backend Configuration
local BACKEND_URL = GetConvar("fiveops_backend_url", "http://127.0.0.1:3000/log")
local INGEST_KEY = GetConvar("fiveops_ingest_key", "")
local IS_DEV_SERVER = GetConvar('isDevServer', 'false') == 'true'
local SERVER_NAME = GetConvar("sv_hostname", "unknown")
local SERVER_ID = GetConvar("sv_projectName", "unknown")

if INGEST_KEY == "" then
    print("^3[FiveOps] fiveops_ingest_key not configured; sending logs is disabled.^0")
end

-- Helper: Extract standard player info for Elastic
local function getPlayerInfo(src)
    if not src or src == 0 or src == "" or src == -1 then return nil end
    
    src = tonumber(src)
    if not src or src <= 0 then return nil end
    local name = GetPlayerName(src)
    if not name then return nil end

    return {
        id = tonumber(src),
        name = name,
        identifiers = {
            steam = GetPlayerIdentifierByType(src, 'steam'),
            license = GetPlayerIdentifierByType(src, 'license'),
            discord = GetPlayerIdentifierByType(src, 'discord'),
            live = GetPlayerIdentifierByType(src, 'live'),
            fivem = GetPlayerIdentifierByType(src, 'fivem')
        }
    }
end

-- Helper: Send to Node.js Backend
local function sendLogToBackend(eventType, category, payload, extraMeta)
    if INGEST_KEY == "" then return end
    local body = {
        ["@timestamp"] = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        event_type = eventType,
        category = category,
        isDevServer = IS_DEV_SERVER,
        server = {
            name = SERVER_NAME,
            id = SERVER_ID
        },
        payload = payload
    }

    -- Merge extraMeta (e.g. player object) if provided
    if extraMeta then
        for k, v in pairs(extraMeta) do
            body[k] = v
        end
    end

    PerformHttpRequest(BACKEND_URL, function(err, text, headers)
        if err ~= 200 and err ~= 201 then
            print("^1[Logging] Failed to send log to backend. Status: " .. tostring(err) .. "^0")
        end
    end, "POST", json.encode(body), {
        ["Content-Type"] = "application/json",
        ["X-FiveOps-Key"] = INGEST_KEY
    })
end

-- Trusted SERVER exports for other resources and the advanced audit module.
-- Never expose this as a RegisterNetEvent: only server resources may create
-- authoritative, script-confirmed audit records.
exports('logEvent', function(eventType, category, payload, playerId)
    if type(eventType) ~= 'string' or type(category) ~= 'string' or
       type(payload) ~= 'table' then return end
    local src = tonumber(playerId)
    sendLogToBackend(eventType:sub(1, 100), category:sub(1, 60), payload,
        src and src > 0 and { player = getPlayerInfo(src) } or nil)
end)

-- Legacy Export Support (Redirects to backend)
local function sendLogThroughApi(channelId, message)
    -- Try to parse the message to extract JSON if possible
    local cleanedMessage = message:gsub("%*%*.-%*%*", ""):gsub("```", ""):match("^%s*(.-)%s*$")
    local decodedMessage = json.decode(cleanedMessage)
    local payload = decodedMessage or { raw_message = message }
    
    sendLogToBackend("legacy_log", "legacy", payload)
end
exports('sendLogThroughApi', sendLogThroughApi)

-- Resource Lifecycle
SetTimeout(1000, function()
    AddEventHandler('onServerResourceStart', function(resourceName)
        local logData = {
            resourceName = resourceName,
            resourceState = GetResourceState(resourceName),
            message = 'Resource ' .. resourceName .. ' has started.'
        }
        sendLogToBackend("resource_start", "resource", logData)
    end)

    AddEventHandler('onServerResourceStop', function(resourceName)
        local logData = {
            resourceName = resourceName,
            resourceState = GetResourceState(resourceName),
            message = 'Resource ' .. resourceName .. ' has stopped.'
        }
        sendLogToBackend("resource_stop", "resource", logData)
    end)
end)

-- Player Lifecycle
AddEventHandler('playerJoining', function(name, setKickReason, deferrals)
    local src = source
    local playerInfo = getPlayerInfo(src)
    local payload = { action = "joining" }
    sendLogToBackend("player_joining", "player", payload, { player = playerInfo })
end)

AddEventHandler('playerDropped', function(reason)
    local src = source
    local playerInfo = getPlayerInfo(src)
    local payload = { reason = reason }
    sendLogToBackend("player_dropped", "player", payload, { player = playerInfo })
end)

-- Chat
RegisterNetEvent('chatMessageEnteredLogging', function(data)
    local src = source
    local playerInfo = getPlayerInfo(src)
    sendLogToBackend("chat_message", "chat", { message_data = data }, { player = playerInfo })
end)

-- Inventory (ox_inventory)
AddEventHandler('onResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if GetResourceState('ox_inventory') ~= 'started' then 
        print('^1[logs] ^0ox_inventory is not started.') 
        return 
    end
    
    -- Assuming ESX is available globally or via exports in the environment
    -- If not, we rely on payload.source and native GetPlayerName

    exports.ox_inventory:registerHook('swapItems', function(payload)
        local src = payload.source
        local playerInfo = getPlayerInfo(src)

        -- Try to get target player info if available
        local fromPlayerInfo = getPlayerInfo(payload.fromInventory) -- might be nil if inventory is not a player
        local toPlayerInfo = getPlayerInfo(payload.toInventory)

        local data = {
            action = payload.action,
            source = payload.source,
            fromSlotName = type(payload.fromSlot) == 'table' and payload.fromSlot.name or nil,
            fromSlotId = type(payload.fromSlot) == 'table' and payload.fromSlot.slot or nil,
            toSlotName = type(payload.toSlot) == 'table' and payload.toSlot.name or nil,
            toSlotId = type(payload.toSlot) == 'table' and payload.toSlot.slot or
                       (type(payload.toSlot) == 'number' and payload.toSlot or nil),
            fromType = payload.fromType,
            toType = payload.toType,
            count = payload.count,
            coords = payload.coords,
            fromPlayer = fromPlayerInfo,
            toPlayer = toPlayerInfo
        }
    
        sendLogToBackend("item_swapped", "inventory", data, { player = playerInfo })

        -- Diamond check logic from original file
        if payload.fromSlot and payload.fromSlot.name and (payload.fromSlot.name == 'tbx_black_diamonds' or payload.fromSlot.name == 'tbx_pink_diamonds') then
             sendLogToBackend("diamonds_swapped", "inventory", data, { player = playerInfo })
        end
    end, {})

    exports.ox_inventory:registerHook('buyItem', function(payload)
        local src = payload.source
        local playerInfo = getPlayerInfo(src)

        local data = {
            shopType = payload.shopType,
            shopId = payload.shopId,
            itemName = payload.itemName,
            count = payload.count,
            price = payload.price,
            totalPrice = payload.totalPrice,
            currency = payload.currency,
            coords = payload.coords
        }

        sendLogToBackend("item_bought", "inventory", data, { player = playerInfo })
    end, {})
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if GetResourceState('ox_inventory') ~= 'started' then return end
    exports.ox_inventory:removeHooks()
end)

-- txAdmin Events
RegisterNetEvent('txsv:req:spectate:start', function(targetSource)
    local src = source -- Admin source
    local adminInfo = getPlayerInfo(src)
    local targetInfo = getPlayerInfo(targetSource)

    local payload = {
        targetSource = targetSource,
        targetPlayer = targetInfo
    }

    sendLogToBackend("tx_spectate_start", "txadmin", payload, { player = adminInfo })
end)

AddEventHandler('txAdmin:events:playerDirectMessage', function(eventData)
    local targetInfo = getPlayerInfo(eventData.target)
    
    local keepContent = GetConvar('fiveops_log_private_messages', 'false') == 'true'
    local payload = {
        author = eventData.author,
        message = keepContent and eventData.message or nil,
        messageLength = type(eventData.message) == 'string' and #eventData.message or nil,
        targetPlayer = targetInfo
    }

    sendLogToBackend("tx_dm", "txadmin", payload)
end)

AddEventHandler('txAdmin:events:actionRevoked', function(eventData)
    local action = eventData.actionType == 'ban' and 'not_found' or eventData.actionType == 'warn' and 'Warned' or "Unknown"

    local payload = {
        banAuthor = eventData.actionAuthor,
        banReason = eventData.actionReason,
        banType = action,
        playerIds = eventData.playerIds,
        actionId = eventData.actionId,
        revokedBy = eventData.revokedBy
    }

    sendLogToBackend("tx_action_revoked", "txadmin", payload)
end)

AddEventHandler('txAdmin:events:playerKicked', function(eventData)
    local targetInfo = getPlayerInfo(eventData.target)
    
    local payload = {
        author = eventData.author,
        reason = eventData.reason,
        targetPlayer = targetInfo
    }

    sendLogToBackend("tx_kicked", "txadmin", payload)
end)

AddEventHandler('txAdmin:events:playerBanned', function(eventData)
    if type(eventData) ~= 'table' then return end
    local targetId = eventData.targetNetId or eventData.target
    local targetInfo = getPlayerInfo(targetId)
    sendLogToBackend("tx_banned", "txadmin", {
        author = eventData.author,
        reason = eventData.reason,
        expiration = eventData.expiration,
        actionId = eventData.actionId,
        targetPlayerId = tonumber(targetId),
        targetName = eventData.targetName or (targetInfo and targetInfo.name),
        targetPlayer = targetInfo
    })
end)

AddEventHandler('txAdmin:events:playerWarned', function(eventData)
    if type(eventData) ~= 'table' then return end
    local targetId = eventData.targetNetId or eventData.target
    local targetInfo = getPlayerInfo(targetId)
    sendLogToBackend("tx_warned", "txadmin", {
        author = eventData.author,
        reason = eventData.reason,
        actionId = eventData.actionId,
        targetPlayerId = tonumber(targetId),
        targetName = eventData.targetName or (targetInfo and targetInfo.name),
        targetPlayer = targetInfo
    })
end)

RegisterNetEvent('txsv:req:healPlayer', function(targetSource)
    local src = source -- Admin
    local adminInfo = getPlayerInfo(src)
    local targetInfo = getPlayerInfo(targetSource)
    
    local payload = {
        targetSource = targetSource,
        everyone = (targetSource == -1),
        targetPlayer = targetInfo
    }

    sendLogToBackend("tx_healed", "txadmin", payload, { player = adminInfo })
end)

AddEventHandler('txAdmin:events:announcement', function(eventData)
    local payload = {
        author = eventData.author,
        message = eventData.message
    }

    sendLogToBackend("tx_announcement", "txadmin", payload)
end)

-- ============================================
-- WEAPON & VEHICLE LOGGING
-- ============================================
-- Stats are computed from ES aggregations, no need to send to dashboard

-- Weapon Usage Tracking
-- Call this when a weapon is fired or used
local function logWeaponUsage(weaponName, isKill)
    local src = source
    local playerInfo = getPlayerInfo(src)
    sendLogToBackend("weapon_used", "combat", {
        weaponName = weaponName,
        isKill = isKill or false
    }, { player = playerInfo })
end
exports('logWeaponUsage', logWeaponUsage)

-- baseevents dispatches these death notifications over the network.
-- Register both events as network-safe before attaching the log-only handlers.
-- Client-reported death details are informational, never grounds for punishment.
RegisterNetEvent('baseevents:onPlayerDied')
RegisterNetEvent('baseevents:onPlayerKilled')

-- Weapon Kill Tracking (call on player death)
AddEventHandler('baseevents:onPlayerDied', function(killerType, deathCoords)
    if killerType and killerType ~= -1 then
        local src = source
        local playerInfo = getPlayerInfo(src)
        
        sendLogToBackend("player_died", "combat", {
            weaponName = tostring(killerType),
            killerType = killerType,
            deathCoords = deathCoords
        }, { player = playerInfo })
    end
end)

AddEventHandler('baseevents:onPlayerKilled', function(killerId, deathData)
    local src = source
    local victimInfo = getPlayerInfo(src)
    local killerInfo = getPlayerInfo(killerId)
    
    if type(deathData) ~= 'table' then return end
    local weaponName = deathData.weaponhash or deathData.weapon or "unknown"
    
    sendLogToBackend("player_killed", "combat", {
        killer = killerInfo,
        victim = victimInfo,
        weaponName = tostring(weaponName),
        deathData = deathData
    }, { player = killerInfo })
end)

-- Vehicle Spawn Tracking
local function logVehicleSpawn(vehicleName)
    local src = source
    local playerInfo = getPlayerInfo(src)
    sendLogToBackend("vehicle_spawned", "vehicle", {
        vehicleName = vehicleName
    }, { player = playerInfo })
end
exports('logVehicleSpawn', logVehicleSpawn)

-- ESX vehicle spawn hook
AddEventHandler('esx:spawnVehicle', function(model, coords, heading)
    logVehicleSpawn(model)
end)

-- Generic vehicle spawn event
RegisterNetEvent('logs:vehicleSpawned', function(vehicleName)
    local src = source
    local playerInfo = getPlayerInfo(src)
    
    sendLogToBackend("vehicle_spawned", "vehicle", {
        vehicleName = vehicleName
    }, { player = playerInfo })
end)