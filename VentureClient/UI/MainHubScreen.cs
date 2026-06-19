using System;
using System.Collections.Generic;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;
using Myra.Graphics2D;
using Myra.Graphics2D.Brushes;
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

        private string _bankSearchQuery = "";
        private string _activeCraftingCategory = "Blacksmithing";
        private string _activeCraftingSubtab = "Weapons";
        private string _activeTrainerCategory = "Physical";

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
                Spacing = 12,
                Padding = new Myra.Graphics2D.Thickness(0, 0, 0, 10),
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetRow(headerPanel, 0);

            _charInfoLabel = new Label
            {
                Text = GetCharacterHeaderText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Gold,
                VerticalAlignment = VerticalAlignment.Center
            };

            var btnEditAvatar = MyraExtensions.CreateButton("✏️", VentureGame.Instance.SmallFont);
            btnEditAvatar.Width = 32;
            btnEditAvatar.Height = 32;
            btnEditAvatar.Padding = new Thickness(0);
            btnEditAvatar.Click += (s, e) => OpenAvatarDialog();

            var btnEditTitle = MyraExtensions.CreateButton("🏆", VentureGame.Instance.SmallFont);
            btnEditTitle.Width = 32;
            btnEditTitle.Height = 32;
            btnEditTitle.Padding = new Thickness(0);
            btnEditTitle.Click += (s, e) => OpenTitleDialog();

            _goldLabel = new Label
            {
                Text = GetGoldText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.Yellow,
                VerticalAlignment = VerticalAlignment.Center
            };

            headerPanel.Widgets.Add(_charInfoLabel);
            headerPanel.Widgets.Add(btnEditAvatar);
            headerPanel.Widgets.Add(btnEditTitle);
            headerPanel.Widgets.Add(new Label { Text = "  |  ", Font = VentureGame.Instance.MainFont, TextColor = Color.Gray, VerticalAlignment = VerticalAlignment.Center });
            headerPanel.Widgets.Add(_goldLabel);
            grid.Widgets.Add(headerPanel);

            // 2. Tab Navigation Buttons
            _tabHeader = new HorizontalStackPanel
            {
                Spacing = 10
            };
            Grid.SetRow(_tabHeader, 1);

            var btnHome = MyraExtensions.CreateButton("🏠 Home", VentureGame.Instance.SmallFont);
            btnHome.Height = 35;
            btnHome.Click += (s, e) => ShowTab("home");

            var btnParty = MyraExtensions.CreateButton("🧑‍🤝‍🧑 Party", VentureGame.Instance.SmallFont);
            btnParty.Height = 35;
            btnParty.Click += (s, e) => ShowTab("party");

            var btnCharacter = MyraExtensions.CreateButton("👤 Character", VentureGame.Instance.SmallFont);
            btnCharacter.Height = 35;
            btnCharacter.Click += (s, e) => ShowTab("character");

            var btnBank = MyraExtensions.CreateButton("🏦 Bank", VentureGame.Instance.SmallFont);
            btnBank.Height = 35;
            btnBank.Click += (s, e) => ShowTab("bank");

            var btnCrafting = MyraExtensions.CreateButton("🛠️ Crafting", VentureGame.Instance.SmallFont);
            btnCrafting.Height = 35;
            btnCrafting.Click += (s, e) => ShowTab("crafting");

            var btnTrainer = MyraExtensions.CreateButton("🎓 Trainer", VentureGame.Instance.SmallFont);
            btnTrainer.Height = 35;
            btnTrainer.Click += (s, e) => ShowTab("trainer");

            var btnQuests = MyraExtensions.CreateButton("📜 Quests", VentureGame.Instance.SmallFont);
            btnQuests.Height = 35;
            btnQuests.Click += (s, e) => ShowTab("quests");

            var btnMap = MyraExtensions.CreateButton("🗺️ Map", VentureGame.Instance.SmallFont);
            btnMap.Height = 35;
            btnMap.Click += (s, e) => ShowTab("map");

            _tabHeader.Widgets.Add(btnHome);
            _tabHeader.Widgets.Add(btnParty);
            _tabHeader.Widgets.Add(btnCharacter);
            _tabHeader.Widgets.Add(btnBank);
            _tabHeader.Widgets.Add(btnCrafting);
            _tabHeader.Widgets.Add(btnTrainer);
            _tabHeader.Widgets.Add(btnQuests);
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
                case "bank":
                    _tabBody.Widgets.Add(BuildBankTab());
                    break;
                case "crafting":
                    _tabBody.Widgets.Add(BuildCraftingTab());
                    break;
                case "trainer":
                    _tabBody.Widgets.Add(BuildTrainerTab());
                    break;
                case "quests":
                    _tabBody.Widgets.Add(BuildQuestsTab());
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

        private void OpenAvatarDialog()
        {
            var dialog = new Dialog
            {
                Title = "Select Avatar",
                Width = 360,
                Height = 220
            };

            var mainLayout = new VerticalStackPanel { Spacing = 12, Padding = new Myra.Graphics2D.Thickness(12) };
            mainLayout.Widgets.Add(new Label { Text = "Choose your avatar icon:", Font = VentureGame.Instance.SmallFont, TextColor = Color.White });

            var avatarButtons = new HorizontalStackPanel { Spacing = 8 };
            string[] avatars = { "🧑", "🧙", "⚔️", "🏹", "🧛", "🛡️" };
            foreach (var av in avatars)
            {
                var btn = MyraExtensions.CreateButton(av, VentureGame.Instance.MainFont);
                btn.Width = 45;
                btn.Height = 45;
                btn.Click += async (sender, e) =>
                {
                    await VentureGame.Instance.Network.EmitPlayerAction("setAvatar", new { icon = av });
                    if (VentureGame.Instance.CharacterState != null)
                    {
                        VentureGame.Instance.CharacterState.CharacterIcon = av;
                    }
                    _charInfoLabel.Text = GetCharacterHeaderText();
                    dialog.Close();
                };
                avatarButtons.Widgets.Add(btn);
            }
            mainLayout.Widgets.Add(avatarButtons);

            var btnClose = MyraExtensions.CreateButton("Close", VentureGame.Instance.SmallFont);
            btnClose.Click += (s, e) => dialog.Close();
            mainLayout.Widgets.Add(btnClose);

            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void OpenTitleDialog()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return;

            var dialog = new Dialog
            {
                Title = "Select Title",
                Width = 320,
                Height = 280
            };

            var mainLayout = new VerticalStackPanel { Spacing = 10, Padding = new Myra.Graphics2D.Thickness(10) };
            mainLayout.Widgets.Add(new Label { Text = "Select your title:", Font = VentureGame.Instance.SmallFont, TextColor = Color.White });

            var listStack = new VerticalStackPanel { Spacing = 6 };
            if (charState.UnlockedTitles != null && charState.UnlockedTitles.Count > 0)
            {
                foreach (var title in charState.UnlockedTitles)
                {
                    bool isCurrent = title == charState.Title;
                    var btnTitle = MyraExtensions.CreateButton(title, VentureGame.Instance.SmallFont);
                    btnTitle.Enabled = !isCurrent;
                    btnTitle.Background = isCurrent ? new SolidBrush(new Color(50, 120, 50)) : new SolidBrush(new Color(40, 45, 52));
                    
                    string targetTitle = title;
                    btnTitle.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("setTitle", new { title = targetTitle });
                        charState.Title = targetTitle;
                        _charInfoLabel.Text = GetCharacterHeaderText();
                        dialog.Close();
                    };
                    listStack.Widgets.Add(btnTitle);
                }
            }
            else
            {
                listStack.Widgets.Add(new Label { Text = "No titles unlocked.", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray });
            }

            var scroll = new ScrollViewer { Content = listStack, Height = 150 };
            mainLayout.Widgets.Add(scroll);

            var btnClose = MyraExtensions.CreateButton("Close", VentureGame.Instance.SmallFont);
            btnClose.Click += (s, e) => dialog.Close();
            mainLayout.Widgets.Add(btnClose);

            dialog.Content = mainLayout;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        // --- BANK TAB ---
        private Widget BuildBankTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new Grid { RowSpacing = 10 };
            layout.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Search & Actions
            layout.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Grids

            // Header Actions Row
            var actionRow = new HorizontalStackPanel { Spacing = 15, VerticalAlignment = VerticalAlignment.Center };
            
            actionRow.Widgets.Add(new Label { Text = "Search Bank:", Font = VentureGame.Instance.SmallFont, TextColor = Color.White, VerticalAlignment = VerticalAlignment.Center });
            var searchBox = new TextBox { Width = 150, Text = _bankSearchQuery };
            searchBox.TextChanged += (s, e) =>
            {
                _bankSearchQuery = searchBox.Text;
                ShowTab("bank");
            };
            actionRow.Widgets.Add(searchBox);

            var btnDepositAll = MyraExtensions.CreateButton("Deposit All", VentureGame.Instance.SmallFont);
            btnDepositAll.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPlayerAction("depositAll");
            };
            actionRow.Widgets.Add(btnDepositAll);

            var btnConsolidate = MyraExtensions.CreateButton("Consolidate Stacks", VentureGame.Instance.SmallFont);
            btnConsolidate.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPlayerAction("consolidateBank");
            };
            actionRow.Widgets.Add(btnConsolidate);

            Grid.SetRow(actionRow, 0);
            layout.Widgets.Add(actionRow);

            // Grids Row
            var gridsGrid = new Grid { ColumnSpacing = 15 };
            gridsGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Inventory
            gridsGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Bank

            // Left Side: Inventory (Deposit)
            var invLayout = new VerticalStackPanel { Spacing = 8 };
            invLayout.Widgets.Add(new Label { Text = "🎒 Your Inventory (Click to Deposit, Right-Click to Lock)", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gold });
            
            var invGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
            for (int i = 0; i < 4; i++) invGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            int r = 0, c = 0;
            for (int idx = 0; idx < 28; idx++)
            {
                ItemData item = null;
                if (charState?.Inventory != null && idx < charState.Inventory.Count)
                {
                    item = charState.Inventory[idx];
                }

                int itemIndex = idx;
                bool isLocked = item != null && (item.GemSlot != null && item.GemSlot.Type == Newtonsoft.Json.Linq.JTokenType.Boolean && (bool)item.GemSlot); // wait, actually lock flag is "locked" boolean in item
                // Let's parse custom locked flag if exists, let's write safe check
                bool isItemLocked = false;
                if (item != null)
                {
                    var jobj = Newtonsoft.Json.Linq.JObject.FromObject(item);
                    if (jobj["locked"] != null && (bool)jobj["locked"])
                    {
                        isItemLocked = true;
                    }
                }

                var buttonText = item != null ? $"{(isItemLocked ? "🔒 " : "")}{item.Icon} {item.Name} x{item.Quantity ?? 1}" : "[Empty]";

                var btn = new Button
                {
                    Height = 45,
                    Padding = new Thickness(2),
                    Background = item != null ? new SolidBrush(new Color(30, 35, 45)) : new SolidBrush(new Color(20, 20, 20, 100)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(isItemLocked ? Color.LightPink : new Color(60, 60, 60))
                };
                btn.Content = new Label { Text = buttonText, Font = VentureGame.Instance.SmallFont, TextColor = item != null ? Color.White : Color.DimGray, Wrap = true, HorizontalAlignment = HorizontalAlignment.Center };

                if (item != null)
                {
                    btn.TouchDown += async (sender, e) =>
                    {
                        var mouseState = Microsoft.Xna.Framework.Input.Mouse.GetState();
                        if (mouseState.RightButton == Microsoft.Xna.Framework.Input.ButtonState.Pressed)
                        {
                            await VentureGame.Instance.Network.EmitPlayerAction("toggleLockItem", new { itemIndex = itemIndex });
                        }
                    };
                    btn.Click += async (sender, e) =>
                    {
                        var mouseState = Microsoft.Xna.Framework.Input.Mouse.GetState();
                        if (mouseState.RightButton != Microsoft.Xna.Framework.Input.ButtonState.Pressed)
                        {
                            await VentureGame.Instance.Network.EmitPlayerAction("depositItem", new { index = itemIndex });
                        }
                    };
                }

                Grid.SetRow(btn, r);
                Grid.SetColumn(btn, c);
                invGrid.Widgets.Add(btn);

                c++;
                if (c >= 4)
                {
                    c = 0;
                    r++;
                }
            }
            invLayout.Widgets.Add(invGrid);
            Grid.SetColumn(invLayout, 0);
            gridsGrid.Widgets.Add(invLayout);

            // Right Side: Bank (Withdraw)
            var bankLayout = new VerticalStackPanel { Spacing = 8 };
            bankLayout.Widgets.Add(new Label { Text = "🏦 Your Bank (Click to Withdraw)", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gold });

            var bankGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
            for (int i = 0; i < 4; i++) bankGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var bankItems = new List<Tuple<ItemData, int>>();
            if (charState?.Bank != null)
            {
                for (int i = 0; i < charState.Bank.Count; i++)
                {
                    var item = charState.Bank[i];
                    if (item == null) continue;
                    if (string.IsNullOrEmpty(_bankSearchQuery) || item.Name.ToLower().Contains(_bankSearchQuery.ToLower()))
                    {
                        bankItems.Add(new Tuple<ItemData, int>(item, i));
                    }
                }
            }

            // Sort bank items alphabetically
            bankItems.Sort((a, b) => a.Item1.Name.CompareTo(b.Item1.Name));

            int br = 0, bc = 0;
            foreach (var tuple in bankItems)
            {
                var item = tuple.Item1;
                int originalIndex = tuple.Item2;

                var btn = new Button
                {
                    Height = 45,
                    Padding = new Thickness(2),
                    Background = new SolidBrush(new Color(30, 35, 45)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(new Color(60, 60, 60))
                };
                btn.Content = new Label { Text = $"{item.Icon} {item.Name} x{item.Quantity ?? 1}", Font = VentureGame.Instance.SmallFont, TextColor = Color.White, Wrap = true, HorizontalAlignment = HorizontalAlignment.Center };
                btn.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitPlayerAction("withdrawItem", new { index = originalIndex });
                };

                Grid.SetRow(btn, br);
                Grid.SetColumn(btn, bc);
                bankGrid.Widgets.Add(btn);

                bc++;
                if (bc >= 4)
                {
                    bc = 0;
                    br++;
                }
            }

            var bankScroll = new ScrollViewer { Content = bankGrid, Height = 320 };
            bankLayout.Widgets.Add(bankScroll);
            Grid.SetColumn(bankLayout, 1);
            gridsGrid.Widgets.Add(bankLayout);

            Grid.SetRow(gridsGrid, 1);
            layout.Widgets.Add(gridsGrid);

            return layout;
        }

        private int GetMaterialCount(string materialName)
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return 0;

            int count = 0;
            if (charState.Inventory != null)
            {
                foreach (var item in charState.Inventory)
                {
                    if (item != null && item.Name == materialName)
                    {
                        count += item.Quantity ?? 1;
                    }
                }
            }
            if (charState.Bank != null)
            {
                foreach (var item in charState.Bank)
                {
                    if (item != null && item.Name == materialName)
                    {
                        count += item.Quantity ?? 1;
                    }
                }
            }
            return count;
        }

        private bool HasMaterials(Dictionary<string, int> materials)
        {
            if (materials == null) return true;
            foreach (var kvp in materials)
            {
                if (GetMaterialCount(kvp.Key) < kvp.Value) return false;
            }
            return true;
        }

        // --- CRAFTING TAB ---
        private Widget BuildCraftingTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new Grid { RowSpacing = 10 };
            layout.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Category tabs
            layout.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Subtab tabs
            layout.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Recipes grid

            // Categories
            var categories = new List<string>();
            foreach (var r in VentureGame.Instance.CraftingRecipes)
            {
                if (!categories.Contains(r.Category)) categories.Add(r.Category);
            }

            var catStack = new HorizontalStackPanel { Spacing = 8 };
            foreach (var cat in categories)
            {
                bool isCurrent = cat == _activeCraftingCategory;
                var btnCat = MyraExtensions.CreateButton(cat, VentureGame.Instance.SmallFont);
                btnCat.Background = isCurrent ? new SolidBrush(new Color(50, 100, 150)) : new SolidBrush(new Color(40, 45, 52));
                
                string targetCat = cat;
                btnCat.Click += (s, e) =>
                {
                    _activeCraftingCategory = targetCat;
                    _activeCraftingSubtab = "Weapons"; // default
                    ShowTab("crafting");
                };
                catStack.Widgets.Add(btnCat);
            }
            Grid.SetRow(catStack, 0);
            layout.Widgets.Add(catStack);

            // Subtabs
            string[] subtabs = { "Weapons", "Armor", "Ammo", "Food", "Materials", "Other" };
            var subStack = new HorizontalStackPanel { Spacing = 8 };
            foreach (var sub in subtabs)
            {
                bool isCurrent = sub == _activeCraftingSubtab;
                var btnSub = MyraExtensions.CreateButton(sub, VentureGame.Instance.SmallFont);
                btnSub.Background = isCurrent ? new SolidBrush(new Color(50, 120, 50)) : new SolidBrush(new Color(40, 45, 52));

                string targetSub = sub;
                btnSub.Click += (s, e) =>
                {
                    _activeCraftingSubtab = targetSub;
                    ShowTab("crafting");
                };
                subStack.Widgets.Add(btnSub);
            }
            Grid.SetRow(subStack, 1);
            layout.Widgets.Add(subStack);

            // Recipes grid
            var recipesGrid = new Grid { RowSpacing = 8, ColumnSpacing = 8 };
            for (int i = 0; i < 3; i++) recipesGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var recipesToDisplay = new List<Tuple<RecipeData, int>>();
            for (int idx = 0; idx < VentureGame.Instance.CraftingRecipes.Count; idx++)
            {
                var recipe = VentureGame.Instance.CraftingRecipes[idx];
                if (recipe.Category != _activeCraftingCategory) continue;

                bool requiresDiscovery = recipe.RequiresDiscovery ?? false;
                if (requiresDiscovery && (charState == null || !charState.KnownRecipes.Contains(recipe.Result.Name)))
                {
                    continue;
                }

                var resultItem = VentureGame.Instance.AllItems.Find(i => i.Name == recipe.Result.Name);
                string subtab = "Other";
                if (resultItem != null)
                {
                    if (resultItem.Type == "weapon") subtab = "Weapons";
                    else if (resultItem.Type == "armor" || resultItem.Type == "shield") subtab = "Armor";
                    else if (resultItem.Type == "arrows") subtab = "Ammo";
                    else if (resultItem.Type == "consumable") subtab = "Food";
                    else if (resultItem.Type == "material") subtab = "Materials";
                }

                if (subtab == _activeCraftingSubtab)
                {
                    recipesToDisplay.Add(new Tuple<RecipeData, int>(recipe, idx));
                }
            }

            // Sort: craftable first, then alphabetically
            recipesToDisplay.Sort((a, b) =>
            {
                bool canCraftA = HasMaterials(a.Item1.Materials);
                bool canCraftB = HasMaterials(b.Item1.Materials);
                if (canCraftA && !canCraftB) return -1;
                if (!canCraftA && canCraftB) return 1;
                return a.Item1.Result.Name.CompareTo(b.Item1.Result.Name);
            });

            int row = 0, col = 0;
            foreach (var tuple in recipesToDisplay)
            {
                var recipe = tuple.Item1;
                int recipeIndex = tuple.Item2;
                bool canCraft = HasMaterials(recipe.Materials);

                var cardPanel = new VerticalStackPanel
                {
                    Spacing = 6,
                    Padding = new Thickness(8),
                    Background = new SolidBrush(new Color(25, 28, 32)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(canCraft ? Color.Gold : new Color(80, 80, 80))
                };

                var resultItem = VentureGame.Instance.AllItems.Find(i => i.Name == recipe.Result.Name);
                string resultIcon = resultItem?.Icon ?? "⚙️";
                cardPanel.Widgets.Add(new Label
                {
                    Text = $"{resultIcon} {(recipe.Result.Quantity > 1 ? recipe.Result.Quantity + "x " : "")}{recipe.Result.Name}",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center
                });

                // Materials checklist
                var matsStack = new VerticalStackPanel { Spacing = 2 };
                foreach (var material in recipe.Materials)
                {
                    int owned = GetMaterialCount(material.Key);
                    int required = material.Value;
                    bool suff = owned >= required;

                    matsStack.Widgets.Add(new Label
                    {
                        Text = $"• {material.Key}: {owned}/{required} {(suff ? "✓" : "✗")}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = suff ? Color.LightGreen : Color.LightPink
                    });
                }
                cardPanel.Widgets.Add(matsStack);

                var btnCraft = MyraExtensions.CreateButton("Craft", VentureGame.Instance.SmallFont);
                btnCraft.Enabled = canCraft;
                btnCraft.Background = canCraft ? new SolidBrush(new Color(50, 120, 50)) : new SolidBrush(new Color(60, 60, 60));
                
                btnCraft.Click += (s, e) =>
                {
                    int maxCraftable = 999;
                    foreach (var kvp in recipe.Materials)
                    {
                        int owned = GetMaterialCount(kvp.Key);
                        int required = kvp.Value;
                        if (required > 0)
                        {
                            int val = owned / required;
                            if (val < maxCraftable) maxCraftable = val;
                        }
                    }
                    if (maxCraftable == 999 || maxCraftable <= 0) maxCraftable = 1;

                    var craftDialog = new Dialog
                    {
                        Title = $"Craft {recipe.Result.Name}",
                        Width = 300,
                        Height = 180
                    };
                    var layout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
                    layout.Widgets.Add(new Label { Text = "Select quantity:", Font = VentureGame.Instance.SmallFont });
                    
                    var slider = new HorizontalSlider
                    {
                        Minimum = 1,
                        Maximum = maxCraftable,
                        Value = 1
                    };
                    layout.Widgets.Add(slider);

                    var lblValue = new Label { Text = "Quantity: 1", Font = VentureGame.Instance.SmallFont, TextColor = Color.Yellow };
                    slider.ValueChanged += (s2, e2) =>
                    {
                        lblValue.Text = $"Quantity: {(int)slider.Value}";
                    };
                    layout.Widgets.Add(lblValue);

                    var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };
                    var btnYes = MyraExtensions.CreateButton("Craft", VentureGame.Instance.SmallFont);
                    btnYes.Click += async (s2, e2) =>
                    {
                        int qty = (int)slider.Value;
                        await VentureGame.Instance.Network.EmitPlayerAction("craftItem", new { recipeIndex = recipeIndex, quantity = qty });
                        craftDialog.Close();
                    };
                    var btnNo = MyraExtensions.CreateButton("Cancel", VentureGame.Instance.SmallFont);
                    btnNo.Click += (s2, e2) => craftDialog.Close();

                    btnRow.Widgets.Add(btnYes);
                    btnRow.Widgets.Add(btnNo);
                    layout.Widgets.Add(btnRow);

                    craftDialog.Content = layout;
                    craftDialog.ShowModal(VentureGame.Instance.Desktop);
                };
                cardPanel.Widgets.Add(btnCraft);

                Grid.SetRow(cardPanel, row);
                Grid.SetColumn(cardPanel, col);
                recipesGrid.Widgets.Add(cardPanel);

                col++;
                if (col >= 3)
                {
                    col = 0;
                    row++;
                }
            }

            var scroll = new ScrollViewer { Content = recipesGrid, Height = 320 };
            Grid.SetRow(scroll, 2);
            layout.Widgets.Add(scroll);

            return layout;
        }

        // --- TRAINER TAB ---
        private Widget BuildTrainerTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new Grid { RowSpacing = 10 };
            layout.RowsProportions.Add(new Proportion(ProportionType.Auto)); // School tabs
            layout.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Spells list

            // Find all trainable spell schools
            var schools = new List<string>();
            foreach (var spell in VentureGame.Instance.AllSpells)
            {
                if (!string.IsNullOrEmpty(spell.School) && !schools.Contains(spell.School))
                {
                    schools.Add(spell.School);
                }
            }

            var schoolStack = new HorizontalStackPanel { Spacing = 8 };
            foreach (var school in schools)
            {
                bool isCurrent = school == _activeTrainerCategory;
                var btnSchool = MyraExtensions.CreateButton(school, VentureGame.Instance.SmallFont);
                btnSchool.Background = isCurrent ? new SolidBrush(new Color(50, 100, 150)) : new SolidBrush(new Color(40, 45, 52));

                string targetSchool = school;
                btnSchool.Click += (s, e) =>
                {
                    _activeTrainerCategory = targetSchool;
                    ShowTab("trainer");
                };
                schoolStack.Widgets.Add(btnSchool);
            }
            Grid.SetRow(schoolStack, 0);
            layout.Widgets.Add(schoolStack);

            // Spells list
            var trainerGrid = new Grid { RowSpacing = 8, ColumnSpacing = 8 };
            for (int i = 0; i < 3; i++) trainerGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var spellsToDisplay = VentureGame.Instance.AllSpells.FindAll(s => s.School == _activeTrainerCategory);
            int row = 0, col = 0;

            foreach (var spell in spellsToDisplay)
            {
                bool knowsSpell = false;
                if (charState != null)
                {
                    knowsSpell = charState.Spellbook.Exists(s => s.Name == spell.Name);
                }

                var cardPanel = new VerticalStackPanel
                {
                    Spacing = 6,
                    Padding = new Thickness(8),
                    Background = new SolidBrush(new Color(25, 28, 32)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(knowsSpell ? Color.Gold : new Color(80, 80, 80))
                };

                cardPanel.Widgets.Add(new Label
                {
                    Text = $"{spell.Icon ?? "✨"} {spell.Name}",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center
                });

                cardPanel.Widgets.Add(new Label
                {
                    Text = $"Cost: {spell.Cost} AP  |  Cooldown: {spell.Cooldown} turns",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.LightGray,
                    HorizontalAlignment = HorizontalAlignment.Center
                });

                cardPanel.Widgets.Add(new Label
                {
                    Text = spell.Description ?? "",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.White,
                    Wrap = true,
                    HorizontalAlignment = HorizontalAlignment.Center
                });

                var btnLearn = MyraExtensions.CreateButton(knowsSpell ? "Known" : "Learn Spells in Zone", VentureGame.Instance.SmallFont);
                btnLearn.Enabled = false; // town trainer is preview list
                btnLearn.Background = new SolidBrush(new Color(60, 60, 60));
                cardPanel.Widgets.Add(btnLearn);

                Grid.SetRow(cardPanel, row);
                Grid.SetColumn(cardPanel, col);
                trainerGrid.Widgets.Add(cardPanel);

                col++;
                if (col >= 3)
                {
                    col = 0;
                    row++;
                }
            }

            var scroll = new ScrollViewer { Content = trainerGrid, Height = 320 };
            Grid.SetRow(scroll, 1);
            layout.Widgets.Add(scroll);

            return layout;
        }

        // --- QUESTS TAB ---
        private Widget BuildQuestsTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
            layout.Widgets.Add(new Label { Text = "📜 Active Quests", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var listStack = new VerticalStackPanel { Spacing = 8 };
            if (charState?.Quests != null && charState.Quests.Count > 0)
            {
                foreach (var quest in charState.Quests)
                {
                    var questPanel = new VerticalStackPanel
                    {
                        Spacing = 4,
                        Padding = new Thickness(8),
                        Background = new SolidBrush(new Color(25, 28, 32)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(new Color(60, 60, 60))
                    };

                    string title = quest.Details?.Title ?? "Unknown Quest";
                    questPanel.Widgets.Add(new Label
                    {
                        Text = title,
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White
                    });

                    int required = quest.Details?.Required ?? 1;
                    string target = quest.Details?.Target ?? "Objectives";
                    string progressText = $"Progress: {quest.Progress} / {required} {target}s defeated";
                    if (quest.Details?.TurnInItems != null && quest.Details.TurnInItems.Count > 0)
                    {
                        progressText = "Collect: ";
                        foreach (var item in quest.Details.TurnInItems)
                        {
                            progressText += $"{item.Key} ({item.Value}) ";
                        }
                    }

                    questPanel.Widgets.Add(new Label
                    {
                        Text = $"{progressText} (Status: {quest.Status})",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.Yellow
                    });

                    // Abandon Quest Button
                    var btnAbandon = new Button
                    {
                        Padding = new Thickness(8, 3),
                        Background = new SolidBrush(new Color(150, 40, 40)),
                        HorizontalAlignment = HorizontalAlignment.Right
                    };
                    btnAbandon.Content = new Label { Text = "Abandon Quest", Font = VentureGame.Instance.SmallFont, TextColor = Color.White };
                    
                    string questId = quest.Details?.Id;
                    btnAbandon.Click += (s, e) =>
                    {
                        var confirm = new Dialog
                        {
                            Title = "Abandon Quest",
                            Width = 250,
                            Height = 120
                        };
                        var confirmLayout = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };
                        confirmLayout.Widgets.Add(new Label { Text = "Abandon this quest?", Font = VentureGame.Instance.SmallFont });
                        var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };
                        var btnYes = MyraExtensions.CreateButton("Yes", VentureGame.Instance.SmallFont);
                        btnYes.Click += async (s2, e2) =>
                        {
                            await VentureGame.Instance.Network.EmitPlayerAction("abandonQuest", new { questId = questId });
                            confirm.Close();
                            await System.Threading.Tasks.Task.Delay(150);
                            ShowTab("quests");
                        };
                        var btnNo = MyraExtensions.CreateButton("No", VentureGame.Instance.SmallFont);
                        btnNo.Click += (s2, e2) => confirm.Close();
                        btnRow.Widgets.Add(btnYes);
                        btnRow.Widgets.Add(btnNo);
                        confirmLayout.Widgets.Add(btnRow);
                        confirm.Content = confirmLayout;
                        confirm.ShowModal(VentureGame.Instance.Desktop);
                    };
                    questPanel.Widgets.Add(btnAbandon);

                    listStack.Widgets.Add(questPanel);
                }
            }
            else
            {
                listStack.Widgets.Add(new Label { Text = "No active quests.", Font = VentureGame.Instance.SmallFont, TextColor = Color.Gray });
            }

            var scroll = new ScrollViewer { Content = listStack, Height = 320 };
            layout.Widgets.Add(scroll);

            return layout;
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
