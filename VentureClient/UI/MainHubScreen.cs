using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Myra.Graphics2D.UI;
using VentureClient.Models;
using VentureClient.Network;

namespace VentureClient.UI
{
    public class MainHubScreen : IScreen
    {
        private Panel _mainPanel;
        
        // Header widgets
        private Label _charInfoLabel;
        private Label _goldLabel;

        // Tabs Layout
        private HorizontalStackPanel _tabHeader;
        private Panel _tabBody;

        // Chat Widgets (Home Tab)
        private VerticalStackPanel _chatLog;
        private ScrollViewer _chatScroll;
        private TextBox _chatInputField;

        // Party Widgets (Party Tab)
        private VerticalStackPanel _partyPanel;

        // Map Widgets (Map Tab)
        private VerticalStackPanel _mapPanel;

        public void Initialize()
        {
            _mainPanel = new Panel();

            // Root Grid Layout
            var grid = new Grid
            {
                RowSpacing = 10,
                Padding = new Myra.Graphics2D.Thickness(15)
            };
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Header
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Tab buttons
            grid.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Tab content panel

            // 1. Header (Stats, Gold, Name)
            var headerPanel = new HorizontalStackPanel
            {
                Spacing = 20,
                Padding = new Myra.Graphics2D.Thickness(0, 0, 0, 10)
            };
            Grid.SetRow(headerPanel, 0);

            _charInfoLabel = new Label
            {
                Text = GetCharacterHeaderText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold
            };
            _goldLabel = new Label
            {
                Text = GetGoldText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Yellow
            };

            headerPanel.Widgets.Add(_charInfoLabel);
            headerPanel.Widgets.Add(_goldLabel);
            grid.Widgets.Add(headerPanel);

            // 2. Tab Navigation Buttons
            _tabHeader = new HorizontalStackPanel
            {
                Spacing = 10
            };
            Grid.SetRow(_tabHeader, 1);

            var btnHome = MyraExtensions.CreateButton("🏠 Home & Chat", VentureGame.Instance.SmallFont);
            btnHome.Height = 35;
            btnHome.Click += (s, e) => ShowTab("home");

            var btnParty = MyraExtensions.CreateButton("🧑‍🤝‍🧑 Party Lobby", VentureGame.Instance.SmallFont);
            btnParty.Height = 35;
            btnParty.Click += (s, e) => ShowTab("party");

            var btnCharacter = MyraExtensions.CreateButton("👤 Inventory & Stats", VentureGame.Instance.SmallFont);
            btnCharacter.Height = 35;
            btnCharacter.Click += (s, e) => ShowTab("character");

            var btnMap = MyraExtensions.CreateButton("🗺️ World Map", VentureGame.Instance.SmallFont);
            btnMap.Height = 35;
            btnMap.Click += (s, e) => ShowTab("map");

            _tabHeader.Widgets.Add(btnHome);
            _tabHeader.Widgets.Add(btnParty);
            _tabHeader.Widgets.Add(btnCharacter);
            _tabHeader.Widgets.Add(btnMap);
            grid.Widgets.Add(_tabHeader);

            // 3. Tab Body Content Area
            _tabBody = new Panel();
            Grid.SetRow(_tabBody, 2);
            grid.Widgets.Add(_tabBody);

            _mainPanel.Widgets.Add(grid);

            // Bind network listeners
            VentureGame.Instance.Network.OnCharacterUpdate += HandleCharacterUpdate;
            VentureGame.Instance.Network.OnPartyUpdate += HandlePartyUpdate;
            VentureGame.Instance.Network.OnGlobalChatMessage += HandleGlobalChat;
            VentureGame.Instance.Network.OnAdventureStarted += HandleAdventureStarted;
            VentureGame.Instance.Network.OnPartyError += HandlePartyError;

            // Show default tab
            ShowTab("home");
        }

        public void LoadContent()
        {
            VentureGame.Instance.Desktop.Root = _mainPanel;
        }

        private string GetCharacterHeaderText()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return "Loading...";
            return $"{charState.CharacterIcon} {charState.CharacterName} - {charState.Title} (HP: {charState.Health}/{charState.MaxHealth})";
        }

        private string GetGoldText()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return "🪙 0g";
            return $"🪙 {charState.Gold}g  |  ⚡ AP: {charState.ActionPoints}";
        }

        private void ShowTab(string tabName)
        {
            _tabBody.Widgets.Clear();

            switch (tabName)
            {
                case "home":
                    _tabBody.Widgets.Add(BuildHomeTab());
                    break;
                case "party":
                    _tabBody.Widgets.Add(BuildPartyTab());
                    break;
                case "character":
                    _tabBody.Widgets.Add(BuildCharacterTab());
                    break;
                case "map":
                    _tabBody.Widgets.Add(BuildMapTab());
                    break;
            }
        }

        // --- HOME / CHAT TAB ---
        private Widget BuildHomeTab()
        {
            var layout = new Grid { RowSpacing = 10 };
            layout.RowsProportions.Add(new Proportion(ProportionType.Fill));  // Chat list
            layout.RowsProportions.Add(new Proportion(ProportionType.Auto));  // Chat input

            // Chat log scrollable area
            _chatLog = new VerticalStackPanel { Spacing = 4 };
            _chatScroll = new ScrollViewer
            {
                Content = _chatLog
            };
            Grid.SetRow(_chatScroll, 0);
            layout.Widgets.Add(_chatScroll);

            // Add welcome message
            AppendChatMessage("System", "Welcome to Venture! Chat with other players here.", Color.Gray);

            // Chat Input
            var inputRow = new Grid { ColumnSpacing = 10 };
            inputRow.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Input
            inputRow.ColumnsProportions.Add(new Proportion(ProportionType.Auto)); // Button

            _chatInputField = new TextBox
            {
                Font = VentureGame.Instance.SmallFont
            };
            _chatInputField.KeyDown += async (s, e) =>
            {
                if (e.Data == Keys.Enter)
                {
                    await SendChatMessage();
                }
            };

            var btnSend = MyraExtensions.CreateButton("Send", VentureGame.Instance.SmallFont);
            btnSend.Width = 80;
            btnSend.Click += async (s, e) =>
            {
                await SendChatMessage();
            };

            inputRow.Widgets.Add(_chatInputField);
            inputRow.Widgets.Add(btnSend);
            Grid.SetColumn(btnSend, 1);

            layout.Widgets.Add(inputRow);
            Grid.SetRow(inputRow, 1);

            return layout;
        }

        private async System.Threading.Tasks.Task SendChatMessage()
        {
            string msg = _chatInputField.Text.Trim();
            if (!string.IsNullOrEmpty(msg))
            {
                _chatInputField.Text = "";
                await VentureGame.Instance.Network.EmitGlobalChatMessage(msg);
            }
        }

        private void AppendChatMessage(string sender, string message, Color color)
        {
            if (_chatLog == null) return;
            var label = new Label
            {
                Text = $"[{sender}]: {message}",
                Font = VentureGame.Instance.SmallFont,
                TextColor = color,
                Wrap = true
            };
            _chatLog.Widgets.Add(label);
            
            // Auto scroll to bottom
            _chatScroll.ScrollPosition = new Point(0, _chatLog.Bounds.Height);
        }

        // --- PARTY TAB ---
        private Widget BuildPartyTab()
        {
            _partyPanel = new VerticalStackPanel { Spacing = 15 };
            RefreshPartyUI();
            return _partyPanel;
        }

        private void RefreshPartyUI()
        {
            if (_partyPanel == null) return;
            _partyPanel.Widgets.Clear();

            var party = VentureGame.Instance.PartyState;
            var charState = VentureGame.Instance.CharacterState;

            if (party == null || string.IsNullOrEmpty(charState?.PartyId))
            {
                var label = new Label
                {
                    Text = "You are not in a party.",
                    Font = VentureGame.Instance.MainFont,
                    TextColor = Color.White
                };
                _partyPanel.Widgets.Add(label);

                var btnCreate = MyraExtensions.CreateButton("Create Party Lobby", VentureGame.Instance.SmallFont);
                btnCreate.Width = 180;
                btnCreate.Height = 40;
                btnCreate.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitCreateParty();
                };
                _partyPanel.Widgets.Add(btnCreate);

                // Join Party Section
                var joinLabel = new Label
                {
                    Text = "Join an existing Party:",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White,
                    Padding = new Myra.Graphics2D.Thickness(0, 15, 0, 0)
                };
                _partyPanel.Widgets.Add(joinLabel);

                var joinRow = new HorizontalStackPanel { Spacing = 10 };
                var inviteIdField = new TextBox { Width = 200 };
                var btnJoin = MyraExtensions.CreateButton("Join", VentureGame.Instance.SmallFont);
                btnJoin.Width = 80;
                btnJoin.Click += async (s, e) =>
                {
                    string id = inviteIdField.Text.Trim();
                    if (!string.IsNullOrEmpty(id))
                    {
                        await VentureGame.Instance.Network.EmitJoinParty(id);
                    }
                };
                joinRow.Widgets.Add(inviteIdField);
                joinRow.Widgets.Add(btnJoin);
                _partyPanel.Widgets.Add(joinRow);
            }
            else
            {
                var label = new Label
                {
                    Text = $"Party Lobby (ID: {party.Id})",
                    Font = VentureGame.Instance.MainFont,
                    TextColor = Color.Gold
                };
                _partyPanel.Widgets.Add(label);

                var membersLabel = new Label
                {
                    Text = $"Party Leader: {party.Leader}\nMembers:\n" + string.Join("\n", party.Members),
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White
                };
                _partyPanel.Widgets.Add(membersLabel);

                // Invite Section
                var inviteRow = new HorizontalStackPanel { Spacing = 10 };
                var nameField = new TextBox { Width = 200 };
                var btnInvite = MyraExtensions.CreateButton("Invite", VentureGame.Instance.SmallFont);
                btnInvite.Width = 80;
                btnInvite.Click += async (s, e) =>
                {
                    string name = nameField.Text.Trim();
                    if (!string.IsNullOrEmpty(name))
                    {
                        await VentureGame.Instance.Network.EmitSendPartyInvite(name);
                        nameField.Text = "";
                    }
                };
                inviteRow.Widgets.Add(nameField);
                inviteRow.Widgets.Add(btnInvite);
                _partyPanel.Widgets.Add(inviteRow);

                var btnLeave = MyraExtensions.CreateButton("Leave Party", VentureGame.Instance.SmallFont);
                btnLeave.Width = 140;
                btnLeave.Height = 35;
                btnLeave.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitLeaveParty();
                };
                _partyPanel.Widgets.Add(btnLeave);
            }
        }

        // --- CHARACTER INVENTORY TAB ---
        private Widget BuildCharacterTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new Grid { ColumnSpacing = 15 };
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Auto)); // Stats Column
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Fill)); // Inventory Column

            // Left Side: Stats
            var statsPanel = new VerticalStackPanel { Spacing = 5, Padding = new Myra.Graphics2D.Thickness(10) };
            statsPanel.Widgets.Add(new Label { Text = "📊 Stats", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });
            if (charState != null)
            {
                statsPanel.Widgets.Add(new Label { Text = $"Strength: {charState.Strength}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Agility: {charState.Agility}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Wisdom: {charState.Wisdom}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Defense: {charState.Defense}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Luck: {charState.Luck}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Max Health: {charState.MaxHealth}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Physical Resistance: {charState.PhysicalResistance}", Font = VentureGame.Instance.SmallFont });
                statsPanel.Widgets.Add(new Label { Text = $"Magical Resistance: {charState.MagicalResistance}", Font = VentureGame.Instance.SmallFont });
            }
            layout.Widgets.Add(statsPanel);

            // Right Side: Inventory Grid
            var invLayout = new VerticalStackPanel { Spacing = 10 };
            invLayout.Widgets.Add(new Label { Text = "🎒 Backpack Items", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var itemGrid = new Grid { RowSpacing = 8, ColumnSpacing = 8 };
            for (int i = 0; i < 4; i++) itemGrid.ColumnsProportions.Add(new Proportion(ProportionType.Auto));

            if (charState?.Inventory != null)
            {
                int r = 0, c = 0;
                for (int idx = 0; idx < charState.Inventory.Count; idx++)
                {
                    var item = charState.Inventory[idx];
                    var buttonText = item != null ? $"{item.Icon} {item.Name}" : "[Empty]";
                    var btn = MyraExtensions.CreateButton(buttonText, VentureGame.Instance.SmallFont);
                    btn.Width = 180;
                    btn.Height = 50;
                    Grid.SetRow(btn, r);
                    Grid.SetColumn(btn, c);
                    
                    itemGrid.Widgets.Add(btn);
                    c++;
                    if (c >= 4)
                    {
                        c = 0;
                        r++;
                    }
                }
            }
            invLayout.Widgets.Add(itemGrid);
            layout.Widgets.Add(invLayout);
            Grid.SetColumn(invLayout, 1);

            return layout;
        }

        // --- MAP TAB ---
        private Widget BuildMapTab()
        {
            _mapPanel = new VerticalStackPanel { Spacing = 10 };
            _mapPanel.Widgets.Add(new Label
            {
                Text = "🗺️ Choose Your Adventure Destination",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold
            });

            string[] zones = { "farmlands", "goblinCaves", "darkForest", "arena" };
            string[] zoneNames = { "🌾 Farmlands", "🦇 Goblin Caves", "🌲 Dark Forest", "⚔️ The Arena" };
            
            for (int i = 0; i < zones.Length; i++)
            {
                string zoneId = zones[i];
                var btn = MyraExtensions.CreateButton(zoneNames[i], VentureGame.Instance.MainFont);
                btn.Height = 45;
                btn.Width = 250;
                btn.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitPartyEnterZone(zoneId);
                };
                _mapPanel.Widgets.Add(btn);
            }

            return _mapPanel;
        }

        // --- EVENT HANDLERS ---
        private void HandleCharacterUpdate(CharacterState character)
        {
            _charInfoLabel.Text = GetCharacterHeaderText();
            _goldLabel.Text = GetGoldText();
        }

        private void HandlePartyUpdate(PartyState party)
        {
            RefreshPartyUI();
        }

        private void HandleGlobalChat(string sender, string message)
        {
            AppendChatMessage(sender, message, Color.LightGoldenrodYellow);
        }

        private void HandleAdventureStarted()
        {
            // Transition to Adventure Screen
            VentureGame.Instance.ScreenManager.ChangeScreen(new AdventureScreen());
        }

        private void HandlePartyError(string error)
        {
            AppendChatMessage("System-Error", error, Color.LightPink);
        }

        public void Update(GameTime gameTime)
        {
        }

        public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
        {
        }

        public void Unload()
        {
            if (VentureGame.Instance?.Network != null)
            {
                VentureGame.Instance.Network.OnCharacterUpdate -= HandleCharacterUpdate;
                VentureGame.Instance.Network.OnPartyUpdate -= HandlePartyUpdate;
                VentureGame.Instance.Network.OnGlobalChatMessage -= HandleGlobalChat;
                VentureGame.Instance.Network.OnAdventureStarted -= HandleAdventureStarted;
                VentureGame.Instance.Network.OnPartyError -= HandlePartyError;
            }
        }
    }
}
