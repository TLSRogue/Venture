using System;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SocketIOClient;
using VentureClient.Models;

namespace VentureClient.Network
{
    public class NetworkManager
    {
        private SocketIO _socket;
        private string _serverUrl;

        // Connection Events
        public event Action OnConnected;
        public event Action OnDisconnected;

        // Game State Events
        public event Action<CharacterState> OnCharacterUpdate;
        public event Action<PartyState> OnPartyUpdate;
        public event Action<AdventureState> OnAdventureUpdate;
        public event Action<string> OnLoadError;
        
        // Chat Events
        public event Action<string, string> OnGlobalChatMessage; // sender, message
        public event Action<string, string> OnZoneChatMessage;   // sender, message

        // Game Flow Events
        public event Action OnAdventureStarted;
        public event Action OnAdventureEnded;
        public event Action<string> OnPartyError;
        public event Action<string, string> OnReceivePartyInvite; // sender, partyId
        public event Action<string, string> OnShowDialogue;       // npcName, dialogueText
        public event Action OnHideDialogue;

        public bool IsConnected => _socket?.Connected ?? false;

        public NetworkManager(string serverUrl = "https://venturecrpg.onrender.com")
        {
            _serverUrl = serverUrl;
        }

        public async Task InitializeAsync()
        {
            var options = new SocketIOOptions
            {
                ConnectionTimeout = TimeSpan.FromSeconds(20),
                Reconnection = true
            };
            _socket = new SocketIO(new Uri(_serverUrl), options);

            // Set up core lifecycle listeners
            _socket.OnConnected += (sender, e) =>
            {
                OnConnected?.Invoke();
            };

            _socket.OnDisconnected += (sender, e) =>
            {
                OnDisconnected?.Invoke();
            };

            // Set up game event listeners
            _socket.On("characterUpdate", response =>
            {
                try
                {
                    var dataToken = response.GetValue<JToken>(0);
                    var character = dataToken.ToObject<CharacterState>();
                    OnCharacterUpdate?.Invoke(character);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing characterUpdate: {ex.Message}");
                }
                return Task.CompletedTask;
            });

            _socket.On("partyUpdate", response =>
            {
                try
                {
                    var dataToken = response.GetValue<JToken>(0);
                    var party = dataToken.ToObject<PartyState>();
                    OnPartyUpdate?.Invoke(party);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing partyUpdate: {ex.Message}");
                }
                return Task.CompletedTask;
            });

            _socket.On("party:adventureUpdate", response =>
            {
                try
                {
                    var dataToken = response.GetValue<JToken>(0);
                    var adventure = dataToken.ToObject<AdventureState>();
                    OnAdventureUpdate?.Invoke(adventure);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error parsing adventureUpdate: {ex.Message}");
                }
                return Task.CompletedTask;
            });

            _socket.On("loadError", response =>
            {
                var error = response.GetValue<string>(0);
                OnLoadError?.Invoke(error);
                return Task.CompletedTask;
            });

            _socket.On("party:adventureStarted", response =>
            {
                OnAdventureStarted?.Invoke();
                return Task.CompletedTask;
            });

            _socket.On("party:adventureEnded", response =>
            {
                OnAdventureEnded?.Invoke();
                return Task.CompletedTask;
            });

            _socket.On("partyError", response =>
            {
                var error = response.GetValue<string>(0);
                OnPartyError?.Invoke(error);
                return Task.CompletedTask;
            });

            _socket.On("receivePartyInvite", response =>
            {
                try
                {
                    var data = response.GetValue<JObject>(0);
                    var sender = data["sender"]?.ToString();
                    var partyId = data["partyId"]?.ToString();
                    OnReceivePartyInvite?.Invoke(sender, partyId);
                }
                catch
                {
                }
                return Task.CompletedTask;
            });

            _socket.On("party:showDialogue", response =>
            {
                try
                {
                    var data = response.GetValue<JObject>(0);
                    var npc = data["npc"]?.ToString();
                    var text = data["text"]?.ToString();
                    OnShowDialogue?.Invoke(npc, text);
                }
                catch
                {
                }
                return Task.CompletedTask;
            });

            _socket.On("party:hideDialogue", response =>
            {
                OnHideDialogue?.Invoke();
                return Task.CompletedTask;
            });

            // Chat Listeners
            _socket.On("chat:globalMessage", response =>
            {
                try
                {
                    var data = response.GetValue<JObject>(0);
                    var sender = data["sender"]?.ToString();
                    var message = data["message"]?.ToString();
                    OnGlobalChatMessage?.Invoke(sender, message);
                }
                catch
                {
                }
                return Task.CompletedTask;
            });

            _socket.On("chat:zoneMessage", response =>
            {
                try
                {
                    var data = response.GetValue<JObject>(0);
                    var sender = data["sender"]?.ToString();
                    var message = data["message"]?.ToString();
                    OnZoneChatMessage?.Invoke(sender, message);
                }
                catch
                {
                }
                return Task.CompletedTask;
            });
            await _socket.ConnectAsync();
        }

        // --- EMIT METHODS ---

        public async Task EmitRegisterPlayer(string characterName, string avatar = "🧑")
        {
            var payload = new { characterName, characterIcon = avatar };
            await _socket.EmitAsync("registerPlayer", new object[] { payload });
        }

        public async Task EmitLoadCharacter(string characterName)
        {
            var payload = new { characterName };
            await _socket.EmitAsync("loadCharacter", new object[] { payload });
        }

        public async Task EmitCreateParty()
        {
            await _socket.EmitAsync("createParty");
        }

        public async Task EmitJoinParty(string partyId)
        {
            await _socket.EmitAsync("joinParty", new object[] { partyId });
        }

        public async Task EmitLeaveParty()
        {
            await _socket.EmitAsync("leaveParty");
        }

        public async Task EmitSendPartyInvite(string targetCharacterName)
        {
            await _socket.EmitAsync("sendPartyInvite", new object[] { targetCharacterName });
        }

        public async Task EmitPartyEnterZone(string zoneName)
        {
            await _socket.EmitAsync("party:enterZone", new object[] { zoneName });
        }

        public async Task EmitPlayerAction(string actionType, object payload = null)
        {
            // Emits action to Socket.io event 'playerAction'
            var data = new { type = actionType, payload };
            await _socket.EmitAsync("playerAction", new object[] { data });
        }

        public async Task EmitPartyAction(object action)
        {
            // Used in adventure turns, e.g. { type: 'move', payload: { ... } }
            await _socket.EmitAsync("party:playerAction", new object[] { action });
        }

        public async Task EmitGlobalChatMessage(string message)
        {
            await _socket.EmitAsync("chat:sendGlobal", new object[] { message });
        }

        public async Task EmitZoneChatMessage(string message)
        {
            await _socket.EmitAsync("chat:sendZone", new object[] { message });
        }

        public async Task DisconnectAsync()
        {
            if (_socket != null)
            {
                await _socket.DisconnectAsync();
            }
        }
    }
}
