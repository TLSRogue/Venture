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
        private Label _titleLabel;
        private Label _statsLabel;
        private Label _goldLabel;
        private Dictionary<string, Button> _tabButtons = new Dictionary<string, Button>();

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
        private string _activeSpellbookCategory = "Physical";
        private string _merchantSellTab = "inventory";
        private string _currentTab = "home";
        private Label _restockTimerLabel;
        private double _timerElapsedMs = 0;

        public void Initialize()
        {
            _mainPanel = new Panel();
            _mainPanel.Background = new SolidBrush(new Color(11, 15, 23));

            // Root Grid Layout
            var grid = new Grid
            {
                RowSpacing = 10,
                Padding = new Myra.Graphics2D.Thickness(15)
            };
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Header Panel (Row 0)
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Stats Bar (Row 1)
            grid.RowsProportions.Add(new Proportion(ProportionType.Auto)); // Tab buttons (Row 2)
            grid.RowsProportions.Add(new Proportion(ProportionType.Fill)); // Tab content panel (Row 3)

            // 1. Header (Name, Title, edit buttons)
            var headerContainer = new VerticalStackPanel
            {
                Spacing = 6,
                Padding = new Thickness(15),
                Background = new SolidBrush(new Color(30, 41, 59)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(51, 65, 85)),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            Grid.SetRow(headerContainer, 0);

            var nameRow = new HorizontalStackPanel
            {
                Spacing = 10,
                HorizontalAlignment = HorizontalAlignment.Center
            };

            _charInfoLabel = new Label
            {
                Text = GetCharacterNameText(),
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                VerticalAlignment = VerticalAlignment.Center
            };

            var btnEditAvatar = MyraExtensions.CreateButton("✏️", VentureGame.Instance.SmallFont);
            btnEditAvatar.Width = 28;
            btnEditAvatar.Height = 28;
            btnEditAvatar.Padding = new Thickness(0);
            btnEditAvatar.Click += (s, e) => OpenAvatarDialog();

            nameRow.Widgets.Add(_charInfoLabel);
            nameRow.Widgets.Add(btnEditAvatar);
            headerContainer.Widgets.Add(nameRow);

            var titleRow = new HorizontalStackPanel
            {
                Spacing = 10,
                HorizontalAlignment = HorizontalAlignment.Center
            };

            _titleLabel = new Label
            {
                Text = GetCharacterTitleText(),
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.Gold,
                VerticalAlignment = VerticalAlignment.Center
            };

            var btnEditTitle = MyraExtensions.CreateButton("🏆", VentureGame.Instance.SmallFont);
            btnEditTitle.Width = 28;
            btnEditTitle.Height = 28;
            btnEditTitle.Padding = new Thickness(0);
            btnEditTitle.Click += (s, e) => OpenTitleDialog();

            titleRow.Widgets.Add(_titleLabel);
            titleRow.Widgets.Add(btnEditTitle);
            headerContainer.Widgets.Add(titleRow);

            grid.Widgets.Add(headerContainer);

            // 1.5 Stats Bar Panel (Centered in a separate Row)
            var statsContainer = new Panel
            {
                Padding = new Thickness(12),
                Background = new SolidBrush(new Color(30, 41, 59)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(51, 65, 85)),
                HorizontalAlignment = HorizontalAlignment.Stretch
            };
            _statsLabel = new Label
            {
                Text = GetStatsBarText(),
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            statsContainer.Widgets.Add(_statsLabel);
            Grid.SetRow(statsContainer, 1);
            grid.Widgets.Add(statsContainer);

            // 2. Tab Navigation Buttons
            _tabHeader = new HorizontalStackPanel
            {
                Spacing = 10
            };
            Grid.SetRow(_tabHeader, 2);

            _tabButtons.Clear();

            var btnHome = MyraExtensions.CreateButton("🏠 Home", VentureGame.Instance.SmallFont);
            btnHome.Click += (s, e) => ShowTab("home");
            _tabButtons["home"] = btnHome;

            var btnParty = MyraExtensions.CreateButton("🧑‍🤝‍🧑 Party", VentureGame.Instance.SmallFont);
            btnParty.Click += (s, e) => ShowTab("party");
            _tabButtons["party"] = btnParty;

            var btnCharacter = MyraExtensions.CreateButton("👤 Character", VentureGame.Instance.SmallFont);
            btnCharacter.Click += (s, e) => ShowTab("character");
            _tabButtons["character"] = btnCharacter;

            var btnBank = MyraExtensions.CreateButton("🏦 Bank", VentureGame.Instance.SmallFont);
            btnBank.Click += (s, e) => ShowTab("bank");
            _tabButtons["bank"] = btnBank;

            var btnCrafting = MyraExtensions.CreateButton("🛠️ Crafting", VentureGame.Instance.SmallFont);
            btnCrafting.Click += (s, e) => ShowTab("crafting");
            _tabButtons["crafting"] = btnCrafting;

            var btnTrainer = MyraExtensions.CreateButton("🎓 Trainer", VentureGame.Instance.SmallFont);
            btnTrainer.Click += (s, e) => ShowTab("trainer");
            _tabButtons["trainer"] = btnTrainer;

            var btnMerchant = MyraExtensions.CreateButton("🏪 Merchant", VentureGame.Instance.SmallFont);
            btnMerchant.Click += (s, e) =>
            {
                TriggerViewMerchant();
                ShowTab("merchant");
            };
            _tabButtons["merchant"] = btnMerchant;

            var btnQuests = MyraExtensions.CreateButton("📜 Quests", VentureGame.Instance.SmallFont);
            btnQuests.Click += (s, e) => ShowTab("quests");
            _tabButtons["quests"] = btnQuests;

            var btnMap = MyraExtensions.CreateButton("🗺️ Map", VentureGame.Instance.SmallFont);
            btnMap.Click += (s, e) => ShowTab("map");
            _tabButtons["map"] = btnMap;

            foreach (var kvp in _tabButtons)
            {
                kvp.Value.Height = 35;
                _tabHeader.Widgets.Add(kvp.Value);
            }
            grid.Widgets.Add(_tabHeader);

            // 3. Tab Body Content Area
            _tabBody = new Panel
            {
                Padding = new Thickness(15),
                Background = new SolidBrush(new Color(30, 41, 59)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(51, 65, 85))
            };
            Grid.SetRow(_tabBody, 3);
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

        private string GetCharacterNameText()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return "Loading...";
            return $"{charState.CharacterIcon} {charState.CharacterName}";
        }

        private string GetCharacterTitleText()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return "The Novice";
            return charState.Title ?? "The Novice";
        }

        private string GetStatsBarText()
        {
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null) return "";
            return $"❤️ Health: {charState.Health} / {charState.MaxHealth}   |   💪 Str: {charState.Strength}   |   🏃 Agi: {charState.Agility}   |   🧠 Wis: {charState.Wisdom}   |   🛡️ Def: {charState.Defense}   |   💰 Gold: {charState.Gold}   |   ⭐ QP: {charState.QuestPoints}";
        }

        private void ShowTab(string tabName)
        {
            _currentTab = tabName;
            _tabBody.Widgets.Clear();

            // Highlight active tab button
            foreach (var kvp in _tabButtons)
            {
                bool isActive = kvp.Key == tabName;
                kvp.Value.Background = isActive ? new SolidBrush(new Color(59, 130, 246)) : new SolidBrush(new Color(30, 41, 59));
                kvp.Value.Border = isActive ? new SolidBrush(new Color(59, 130, 246)) : new SolidBrush(new Color(51, 65, 85));
            }

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
                case "merchant":
                    _tabBody.Widgets.Add(BuildMerchantTab());
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
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Left Column
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Right Column

            // ============ LEFT COLUMN ============
            var leftCol = new VerticalStackPanel { Spacing = 10 };
            var leftScroll = new ScrollViewer { Content = leftCol };
            Grid.SetColumn(leftScroll, 0);
            layout.Widgets.Add(leftScroll);

            // --- Equipment Section ---
            leftCol.Widgets.Add(new Label { Text = "⚔️ Equipment", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var equipGrid = new Grid { RowSpacing = 8, ColumnSpacing = 8 };
            equipGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));
            equipGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var slotDefs = new (string key, string label)[]
            {
                ("mainHand", "Main Hand"), ("offHand", "Off Hand"),
                ("helmet", "Helmet"), ("armor", "Armor"),
                ("boots", "Boots"), ("accessory", "Accessory")
            };

            int eqRow = 0, eqCol = 0;
            foreach (var (slotKey, slotLabel) in slotDefs)
            {
                ItemData equippedItem = null;
                if (charState?.Equipment != null)
                {
                    equippedItem = slotKey switch
                    {
                        "mainHand" => charState.Equipment.MainHand,
                        "offHand" => charState.Equipment.OffHand,
                        "helmet" => charState.Equipment.Helmet,
                        "armor" => charState.Equipment.Armor,
                        "boots" => charState.Equipment.Boots,
                        "accessory" => charState.Equipment.Accessory,
                        _ => null
                    };
                }

                bool is2HBlocked = slotKey == "offHand" && charState?.Equipment?.MainHand != null && (charState.Equipment.MainHand.Hands ?? 0) == 2;

                var slotPanel = new VerticalStackPanel
                {
                    Spacing = 4,
                    Padding = new Thickness(8),
                    Background = new SolidBrush(equippedItem != null ? new Color(28, 35, 48) : new Color(20, 22, 28)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(equippedItem != null ? new Color(80, 120, 160) : new Color(50, 50, 60)),
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    MinHeight = 80
                };

                slotPanel.Widgets.Add(new Label
                {
                    Text = slotLabel,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.LightGray,
                    HorizontalAlignment = HorizontalAlignment.Center
                });

                if (is2HBlocked)
                {
                    slotPanel.Widgets.Add(new Label
                    {
                        Text = "(Blocked by 2H)",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.DimGray,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                }
                else if (equippedItem != null)
                {
                    slotPanel.Widgets.Add(new Label
                    {
                        Text = $"{equippedItem.Icon ?? "❓"}\n{equippedItem.Name}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White,
                        Wrap = true,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    string capturedSlot = slotKey;
                    var btnUnequip = MyraExtensions.CreateButton("UNEQUIP", VentureGame.Instance.SmallFont);
                    btnUnequip.Background = new SolidBrush(new Color(180, 50, 50));
                    btnUnequip.Height = 26;
                    btnUnequip.HorizontalAlignment = HorizontalAlignment.Center;
                    btnUnequip.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("unequipItem", new { slot = capturedSlot });
                    };
                    slotPanel.Widgets.Add(btnUnequip);
                }
                else
                {
                    slotPanel.Widgets.Add(new Label
                    {
                        Text = "Empty",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.DimGray,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                }

                Grid.SetRow(slotPanel, eqRow);
                Grid.SetColumn(slotPanel, eqCol);
                equipGrid.Widgets.Add(slotPanel);

                eqCol++;
                if (eqCol >= 2) { eqCol = 0; eqRow++; }
            }
            leftCol.Widgets.Add(equipGrid);

            // --- Equipped Spells Section ---
            leftCol.Widgets.Add(new Label { Text = "✨ Equipped Spells", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold, Padding = new Thickness(0, 10, 0, 0) });

            var spellEquipGrid = new Grid { RowSpacing = 8, ColumnSpacing = 8 };
            spellEquipGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));
            spellEquipGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            for (int i = 0; i < 5; i++)
            {
                SpellData spell = null;
                if (charState?.EquippedSpells != null && i < charState.EquippedSpells.Count)
                    spell = charState.EquippedSpells[i];

                int spellRow = i / 2;
                int spellCol = i % 2;

                var spellPanel = new VerticalStackPanel
                {
                    Spacing = 4,
                    Padding = new Thickness(8),
                    Background = new SolidBrush(spell != null ? new Color(28, 35, 48) : new Color(20, 22, 28, 120)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(spell != null ? new Color(80, 120, 160) : new Color(50, 50, 60)),
                    HorizontalAlignment = HorizontalAlignment.Stretch,
                    MinHeight = 60
                };

                if (spell != null)
                {
                    spellPanel.Widgets.Add(new Label
                    {
                        Text = $"{spell.Icon ?? "✨"} {spell.Name}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                    spellPanel.Widgets.Add(new Label
                    {
                        Text = $"({spell.School ?? "Physical"})",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = new Color(180, 160, 100),
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    int capturedIdx = i;
                    var btnUnequipSpell = MyraExtensions.CreateButton("UNEQUIP", VentureGame.Instance.SmallFont);
                    btnUnequipSpell.Background = new SolidBrush(new Color(180, 50, 50));
                    btnUnequipSpell.Height = 26;
                    btnUnequipSpell.HorizontalAlignment = HorizontalAlignment.Center;
                    btnUnequipSpell.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("unequipSpell", new { index = capturedIdx });
                    };
                    spellPanel.Widgets.Add(btnUnequipSpell);
                }
                else
                {
                    spellPanel.Widgets.Add(new Label
                    {
                        Text = "Empty Spell Slot",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.DimGray,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                }

                Grid.SetRow(spellPanel, spellRow);
                Grid.SetColumn(spellPanel, spellCol);
                spellEquipGrid.Widgets.Add(spellPanel);
            }
            leftCol.Widgets.Add(spellEquipGrid);

            // ============ RIGHT COLUMN ============
            var rightCol = new VerticalStackPanel { Spacing = 10 };
            var rightScroll = new ScrollViewer { Content = rightCol };
            Grid.SetColumn(rightScroll, 1);
            layout.Widgets.Add(rightScroll);

            // --- Inventory Section ---
            rightCol.Widgets.Add(new Label { Text = "🎒 Inventory", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold });

            var invGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
            for (int i = 0; i < 5; i++) invGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            int invSlots = 30;
            for (int idx = 0; idx < invSlots; idx++)
            {
                ItemData item = null;
                if (charState?.Inventory != null && idx < charState.Inventory.Count)
                    item = charState.Inventory[idx];

                int ir = idx / 5;
                int ic = idx % 5;

                var slotBtn = new Button
                {
                    Width = 60,
                    Height = 60,
                    Padding = new Thickness(2),
                    Background = item != null ? new SolidBrush(GetRarityBgColor(item.Rarity)) : new SolidBrush(new Color(20, 22, 28, 100)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(item != null ? GetRarityBorderColor(item.Rarity) : new Color(50, 50, 60))
                };

                if (item != null)
                {
                    var btnLayout = new Panel();
                    btnLayout.Widgets.Add(new Label
                    {
                        Text = item.Icon ?? "❓",
                        Font = VentureGame.Instance.MainFont,
                        TextColor = Color.White,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    });

                    if ((item.Quantity ?? 1) > 1)
                    {
                        btnLayout.Widgets.Add(new Label
                        {
                            Text = item.Quantity.ToString(),
                            Font = VentureGame.Instance.SmallFont,
                            TextColor = Color.Yellow,
                            HorizontalAlignment = HorizontalAlignment.Right,
                            VerticalAlignment = VerticalAlignment.Bottom
                        });
                    }
                    slotBtn.Content = btnLayout;

                    int capturedIdx = idx;
                    slotBtn.Click += (s, e) => ShowItemActionDialog(capturedIdx, item);
                }
                else
                {
                    slotBtn.Content = new Label
                    {
                        Text = "",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.DimGray,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    };
                }

                Grid.SetRow(slotBtn, ir);
                Grid.SetColumn(slotBtn, ic);
                invGrid.Widgets.Add(slotBtn);
            }
            rightCol.Widgets.Add(invGrid);

            // --- Spellbook Section ---
            rightCol.Widgets.Add(new Label { Text = "📖 Spellbook", Font = VentureGame.Instance.MainFont, TextColor = Color.Gold, Padding = new Thickness(0, 10, 0, 0) });

            if (charState?.Spellbook == null || charState.Spellbook.Count == 0)
            {
                rightCol.Widgets.Add(new Label
                {
                    Text = "You have not learned any spells yet.",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.DimGray
                });
            }
            else
            {
                // Category tabs
                var categories = new List<string>();
                foreach (var sp in charState.Spellbook)
                {
                    string school = sp.School ?? "Physical";
                    if (!categories.Contains(school)) categories.Add(school);
                }

                var spellTabRow = new HorizontalStackPanel { Spacing = 6 };
                foreach (var cat in categories)
                {
                    bool isActive = cat == _activeSpellbookCategory;
                    var tabBtn = MyraExtensions.CreateButton(cat, VentureGame.Instance.SmallFont);
                    tabBtn.Background = isActive ? new SolidBrush(new Color(50, 100, 150)) : new SolidBrush(new Color(40, 45, 52));
                    string capturedCat = cat;
                    tabBtn.Click += (s, e) =>
                    {
                        _activeSpellbookCategory = capturedCat;
                        ShowTab("character");
                    };
                    spellTabRow.Widgets.Add(tabBtn);
                }
                rightCol.Widgets.Add(spellTabRow);

                var filteredSpells = charState.Spellbook.FindAll(s => (s.School ?? "Physical") == _activeSpellbookCategory);
                var spellGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
                spellGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));
                spellGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

                int sr = 0, sc = 0;
                foreach (var spell in filteredSpells)
                {
                    int originalIdx = charState.Spellbook.IndexOf(spell);
                    var spCard = new VerticalStackPanel
                    {
                        Spacing = 4,
                        Padding = new Thickness(8),
                        Background = new SolidBrush(new Color(25, 28, 32)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(new Color(60, 70, 80))
                    };

                    spCard.Widgets.Add(new Label
                    {
                        Text = $"{spell.Icon ?? "✨"} {spell.Name}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.White,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                    spCard.Widgets.Add(new Label
                    {
                        Text = $"{spell.Cost} AP | CD: {spell.Cooldown}",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.LightGray,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });

                    bool canEquip = (charState.EquippedSpells?.Count ?? 0) < 5;
                    if (canEquip)
                    {
                        int capturedOrigIdx = originalIdx;
                        var btnEquip = MyraExtensions.CreateButton("Equip", VentureGame.Instance.SmallFont);
                        btnEquip.Background = new SolidBrush(new Color(50, 140, 60));
                        btnEquip.Height = 26;
                        btnEquip.HorizontalAlignment = HorizontalAlignment.Center;
                        btnEquip.Click += async (s, e) =>
                        {
                            await VentureGame.Instance.Network.EmitPlayerAction("equipSpell", new { index = capturedOrigIdx });
                        };
                        spCard.Widgets.Add(btnEquip);
                    }

                    Grid.SetRow(spCard, sr);
                    Grid.SetColumn(spCard, sc);
                    spellGrid.Widgets.Add(spCard);

                    sc++;
                    if (sc >= 2) { sc = 0; sr++; }
                }
                rightCol.Widgets.Add(spellGrid);
            }

            return layout;
        }

        private void ShowItemActionDialog(int itemIndex, ItemData item)
        {
            var dialog = new Dialog
            {
                Title = item.Name,
                Width = 350,
                Height = 300
            };

            var content = new VerticalStackPanel { Spacing = 8, Padding = new Thickness(10) };

            // Item info
            content.Widgets.Add(new Label
            {
                Text = $"{item.Icon ?? "❓"} {item.Name}",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center
            });
            if (!string.IsNullOrEmpty(item.Description))
            {
                content.Widgets.Add(new Label
                {
                    Text = item.Description,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.LightGray,
                    Wrap = true
                });
            }

            // Equip buttons (if item has slots)
            if (item.Slot != null && item.Slot.Count > 0)
            {
                foreach (var slot in item.Slot)
                {
                    string capturedSlot = slot;
                    int capturedIdx = itemIndex;
                    var btnEquip = MyraExtensions.CreateButton($"Equip to {slot}", VentureGame.Instance.SmallFont);
                    btnEquip.Background = new SolidBrush(new Color(40, 100, 180));
                    btnEquip.Height = 32;
                    btnEquip.Click += async (s, e) =>
                    {
                        await VentureGame.Instance.Network.EmitPlayerAction("equipItem", new { itemIndex = capturedIdx, chosenSlot = capturedSlot });
                        dialog.Close();
                    };
                    content.Widgets.Add(btnEquip);
                }
            }

            // Use consumable
            if (item.Type == "consumable")
            {
                int capturedIdx = itemIndex;
                var btnUse = MyraExtensions.CreateButton("Use", VentureGame.Instance.SmallFont);
                btnUse.Background = new SolidBrush(new Color(50, 140, 60));
                btnUse.Height = 32;
                btnUse.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitPlayerAction("useConsumable", new { index = capturedIdx });
                    dialog.Close();
                };
                content.Widgets.Add(btnUse);
            }

            // Learn recipe
            if (item.Type == "recipe" && !string.IsNullOrEmpty(item.LearnsRecipe))
            {
                bool alreadyKnown = VentureGame.Instance.CharacterState?.KnownRecipes?.Contains(item.LearnsRecipe) ?? false;
                int capturedIdx = itemIndex;
                var btnLearn = MyraExtensions.CreateButton(alreadyKnown ? "Already Known" : "Learn Recipe", VentureGame.Instance.SmallFont);
                btnLearn.Background = new SolidBrush(alreadyKnown ? new Color(60, 60, 60) : new Color(50, 140, 60));
                btnLearn.Enabled = !alreadyKnown;
                btnLearn.Height = 32;
                btnLearn.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitPlayerAction("useRecipe", new { index = capturedIdx });
                    dialog.Close();
                };
                content.Widgets.Add(btnLearn);
            }

            // Drop button
            {
                int capturedIdx = itemIndex;
                var btnDrop = MyraExtensions.CreateButton("Drop", VentureGame.Instance.SmallFont);
                btnDrop.Background = new SolidBrush(new Color(180, 50, 50));
                btnDrop.Height = 32;
                btnDrop.Click += async (s, e) =>
                {
                    await VentureGame.Instance.Network.EmitPlayerAction("drop", new { index = capturedIdx });
                    dialog.Close();
                };
                content.Widgets.Add(btnDrop);
            }

            // Cancel
            var btnCancel = MyraExtensions.CreateButton("Cancel", VentureGame.Instance.SmallFont);
            btnCancel.Height = 32;
            btnCancel.Click += (s, e) => dialog.Close();
            content.Widgets.Add(btnCancel);

            dialog.Content = content;
            dialog.ShowModal(VentureGame.Instance.Desktop);
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
            VentureGame.Instance.RunOnMainThread(() =>
            {
                if (_charInfoLabel != null)
                    _charInfoLabel.Text = GetCharacterNameText();
                if (_titleLabel != null)
                    _titleLabel.Text = GetCharacterTitleText();
                if (_statsLabel != null)
                    _statsLabel.Text = GetStatsBarText();
                if (!string.IsNullOrEmpty(_currentTab) && (_currentTab == "character" || _currentTab == "merchant" || _currentTab == "bank" || _currentTab == "trainer" || _currentTab == "crafting" || _currentTab == "quests"))
                {
                    ShowTab(_currentTab);
                }
            });
        }

        private void HandlePartyUpdate(PartyState party)
        {
            VentureGame.Instance.RunOnMainThread(() =>
            {
                RefreshPartyUI();
            });
        }

        private void HandleGlobalChat(string sender, string message)
        {
            VentureGame.Instance.RunOnMainThread(() =>
            {
                AppendChatMessage(sender, message, Color.LightGoldenrodYellow);
            });
        }

        private void HandleAdventureStarted()
        {
            VentureGame.Instance.RunOnMainThread(() =>
            {
                // Transition to Adventure Screen
                VentureGame.Instance.ScreenManager.ChangeScreen(new AdventureScreen());
            });
        }

        private void HandlePartyError(string error)
        {
            VentureGame.Instance.RunOnMainThread(() =>
            {
                AppendChatMessage("System-Error", error, Color.LightPink);
            });
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
                    if (_charInfoLabel != null)
                        _charInfoLabel.Text = GetCharacterNameText();
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
                        if (_titleLabel != null)
                            _titleLabel.Text = GetCharacterTitleText();
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
                    Background = item != null ? new SolidBrush(GetRarityBgColor(item.Rarity)) : new SolidBrush(new Color(20, 20, 20, 100)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(isItemLocked ? Color.LightPink : (item != null ? GetRarityBorderColor(item.Rarity) : new Color(60, 60, 60)))
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
                    Background = new SolidBrush(GetRarityBgColor(item.Rarity)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(GetRarityBorderColor(item.Rarity))
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

        private async void TriggerViewMerchant()
        {
            try
            {
                await VentureGame.Instance.Network.EmitPlayerAction("viewMerchant", new { });
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error emitting viewMerchant: " + ex.Message);
            }
        }

        private Widget BuildMerchantTab()
        {
            var charState = VentureGame.Instance.CharacterState;
            var layout = new Grid { ColumnSpacing = 15 };
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Left Column: Wares
            layout.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f)); // Right Column: Selling

            // ============ LEFT COLUMN: WARES ============
            var leftCol = new VerticalStackPanel { Spacing = 10 };
            var leftScroll = new ScrollViewer { Content = leftCol };
            Grid.SetColumn(leftScroll, 0);
            layout.Widgets.Add(leftScroll);

            // Title
            leftCol.Widgets.Add(new Label { Text = "Merchant's Shop", Font = VentureGame.Instance.MainFont, TextColor = Color.White });

            // Subtitle / Restock Timer
            var subtitlePanel = new HorizontalStackPanel { Spacing = 10 };
            subtitlePanel.Widgets.Add(new Label { Text = $"Your Gold: 💰 {charState?.Gold ?? 0}g  |  ", Font = VentureGame.Instance.SmallFont, TextColor = Color.LightGray });
            _restockTimerLabel = new Label
            {
                Text = "Restock in: --:--",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.LightGray
            };
            UpdateRestockTimerText();
            subtitlePanel.Widgets.Add(_restockTimerLabel);
            leftCol.Widgets.Add(subtitlePanel);

            // Separator line
            leftCol.Widgets.Add(new Panel
            {
                Height = 1,
                Background = new SolidBrush(new Color(55, 65, 81)),
                Margin = new Thickness(0, 5, 0, 10)
            });

            // --- Permanent Stock Section ---
            leftCol.Widgets.Add(new Label { Text = "Permanent Stock", Font = VentureGame.Instance.MainFont, TextColor = Color.White, Padding = new Thickness(0, 5, 0, 5) });

            var permanentGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
            for (int i = 0; i < 6; i++) permanentGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

            var permanentStock = VentureGame.Instance.AllItems.FindAll(item =>
                item.Type == "tool" || item.Name == "Spices" || (item.PermanentMerchantStock ?? false));

            int permRow = 0, permCol = 0;
            foreach (var item in permanentStock)
            {
                bool canAfford = charState != null && charState.Gold >= item.Price;
                var slotBtn = new Button
                {
                    Width = 60,
                    Height = 60,
                    Padding = new Thickness(2),
                    Background = new SolidBrush(GetRarityBgColor(item.Rarity)),
                    BorderThickness = new Thickness(1),
                    Border = new SolidBrush(canAfford ? GetRarityBorderColor(item.Rarity) : new Color(120, 50, 50))
                };
                slotBtn.Content = new Label
                {
                    Text = item.Icon ?? "❓",
                    Font = VentureGame.Instance.MainFont,
                    TextColor = Color.White,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center
                };

                var capturedItem = item;
                slotBtn.Click += (s, e) =>
                {
                    ShowBuyConfirmationDialog(capturedItem, isPermanent: true);
                };

                Grid.SetRow(slotBtn, permRow);
                Grid.SetColumn(slotBtn, permCol);
                permanentGrid.Widgets.Add(slotBtn);

                permCol++;
                if (permCol >= 6) { permCol = 0; permRow++; }
            }
            leftCol.Widgets.Add(permanentGrid);

            // --- Rotating Wares Section ---
            leftCol.Widgets.Add(new Label { Text = "Rotating Wares", Font = VentureGame.Instance.MainFont, TextColor = Color.White, Padding = new Thickness(0, 15, 0, 5) });

            var rotatingStock = charState?.MerchantStock ?? new List<ItemData>();
            if (rotatingStock.Count == 0)
            {
                leftCol.Widgets.Add(new Label
                {
                    Text = "No rotating wares available.",
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.DimGray
                });
            }
            else
            {
                var rotatingGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
                for (int i = 0; i < 6; i++) rotatingGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

                int rotRow = 0, rotCol = 0;
                for (int i = 0; i < rotatingStock.Count; i++)
                {
                    var item = rotatingStock[i];
                    bool canBuy = charState != null && charState.Gold >= item.Price && (item.Quantity ?? 0) > 0;
                    
                    var slotBtn = new Button
                    {
                        Width = 60,
                        Height = 60,
                        Padding = new Thickness(2),
                        Background = new SolidBrush(GetRarityBgColor(item.Rarity)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(canBuy ? GetRarityBorderColor(item.Rarity) : new Color(120, 50, 50))
                    };

                    var btnLayout = new Panel();
                    btnLayout.Widgets.Add(new Label
                    {
                        Text = item.Icon ?? "❓",
                        Font = VentureGame.Instance.MainFont,
                        TextColor = Color.White,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center
                    });

                    btnLayout.Widgets.Add(new Label
                    {
                        Text = (item.Quantity ?? 0).ToString(),
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.Yellow,
                        HorizontalAlignment = HorizontalAlignment.Right,
                        VerticalAlignment = VerticalAlignment.Bottom
                    });
                    slotBtn.Content = btnLayout;

                    var capturedItem = item;
                    int capturedIndex = i;
                    slotBtn.Click += (s, e) =>
                    {
                        ShowBuyConfirmationDialog(capturedItem, isPermanent: false, capturedIndex);
                    };

                    Grid.SetRow(slotBtn, rotRow);
                    Grid.SetColumn(slotBtn, rotCol);
                    rotatingGrid.Widgets.Add(slotBtn);

                    rotCol++;
                    if (rotCol >= 6) { rotCol = 0; rotRow++; }
                }
                leftCol.Widgets.Add(rotatingGrid);
            }

            // ============ RIGHT COLUMN: SELLING ============
            var rightCol = new VerticalStackPanel { Spacing = 10 };
            var rightScroll = new ScrollViewer { Content = rightCol };
            Grid.SetColumn(rightScroll, 1);
            layout.Widgets.Add(rightScroll);

            // Title
            rightCol.Widgets.Add(new Label { Text = "Sell from Inventory", Font = VentureGame.Instance.MainFont, TextColor = Color.White });

            // Tab Navigation for selling
            var sellTabs = new HorizontalStackPanel { Spacing = 8 };

            var btnInvTab = MyraExtensions.CreateButton("Inventory", VentureGame.Instance.SmallFont, _merchantSellTab == "inventory" ? Color.Black : Color.White);
            btnInvTab.Background = _merchantSellTab == "inventory" ? new SolidBrush(new Color(241, 196, 15)) : new SolidBrush(new Color(40, 45, 52));
            btnInvTab.Click += (s, e) =>
            {
                _merchantSellTab = "inventory";
                ShowTab("merchant");
            };
            sellTabs.Widgets.Add(btnInvTab);

            var btnBankTab = MyraExtensions.CreateButton("Bank", VentureGame.Instance.SmallFont, _merchantSellTab == "bank" ? Color.Black : Color.White);
            btnBankTab.Background = _merchantSellTab == "bank" ? new SolidBrush(new Color(241, 196, 15)) : new SolidBrush(new Color(40, 45, 52));
            btnBankTab.Click += (s, e) =>
            {
                _merchantSellTab = "bank";
                ShowTab("merchant");
            };
            sellTabs.Widgets.Add(btnBankTab);

            rightCol.Widgets.Add(sellTabs);

            // --- Sell All Junk Quick Action ---
            var junkItems = new List<Tuple<ItemData, int>>();
            if (charState?.Inventory != null)
            {
                for (int idx = 0; idx < charState.Inventory.Count; idx++)
                {
                    var item = charState.Inventory[idx];
                    if (item != null && item.Type == "material" && item.Tier == 1 && item.Rarity == "common" && item.Price > 0)
                    {
                        junkItems.Add(new Tuple<ItemData, int>(item, idx));
                    }
                }
            }

            int totalJunkValue = 0;
            foreach (var tuple in junkItems)
            {
                int itemSellPrice = Math.Max(1, (int)Math.Floor(tuple.Item1.Price / 2.0));
                totalJunkValue += itemSellPrice * (tuple.Item1.Quantity ?? 1);
            }

            var junkPanel = new VerticalStackPanel
            {
                Spacing = 4,
                Padding = new Thickness(10),
                Background = new SolidBrush(new Color(25, 25, 25)),
                BorderThickness = new Thickness(1),
                Border = new SolidBrush(new Color(50, 50, 50))
            };

            var btnSellJunk = MyraExtensions.CreateButton($"💰 SELL ALL JUNK ({junkItems.Count} ITEMS, {totalJunkValue}G)", VentureGame.Instance.SmallFont);
            btnSellJunk.Background = junkItems.Count > 0 ? new SolidBrush(new Color(180, 120, 30)) : new SolidBrush(new Color(60, 60, 60));
            btnSellJunk.Enabled = junkItems.Count > 0;
            btnSellJunk.Click += (s, e) =>
            {
                ShowSellAllJunkDialog(junkItems, totalJunkValue);
            };
            junkPanel.Widgets.Add(btnSellJunk);

            var junkHelpText = new Label
            {
                Text = "Sells common T1 materials from inventory",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.DimGray,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            junkPanel.Widgets.Add(junkHelpText);
            rightCol.Widgets.Add(junkPanel);

            // --- Sell Inventory Grid ---
            if (_merchantSellTab == "inventory")
            {
                var sellInvGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
                for (int i = 0; i < 5; i++) sellInvGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

                int invSlots = 30; // 5 columns * 6 rows
                for (int idx = 0; idx < invSlots; idx++)
                {
                    ItemData item = null;
                    if (charState?.Inventory != null && idx < charState.Inventory.Count)
                        item = charState.Inventory[idx];

                    int ir = idx / 5;
                    int ic = idx % 5;

                    bool isItemLocked = false;
                    if (item != null)
                    {
                        var jobj = Newtonsoft.Json.Linq.JObject.FromObject(item);
                        if (jobj["locked"] != null && (bool)jobj["locked"])
                        {
                            isItemLocked = true;
                        }
                    }

                    var slotBtn = new Button
                    {
                        Width = 60,
                        Height = 60,
                        Padding = new Thickness(2),
                        Background = item != null ? new SolidBrush(GetRarityBgColor(item.Rarity)) : new SolidBrush(new Color(20, 22, 28, 100)),
                        BorderThickness = new Thickness(1),
                        Border = new SolidBrush(isItemLocked ? Color.LightPink : (item != null ? GetRarityBorderColor(item.Rarity) : new Color(50, 50, 60)))
                    };

                    if (item != null)
                    {
                        var btnLayout = new Panel();
                        btnLayout.Widgets.Add(new Label
                        {
                            Text = item.Icon ?? "❓",
                            Font = VentureGame.Instance.MainFont,
                            TextColor = isItemLocked ? Color.LightPink : Color.White,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center
                        });

                        if ((item.Quantity ?? 1) > 1)
                        {
                            btnLayout.Widgets.Add(new Label
                            {
                                Text = item.Quantity.ToString(),
                                Font = VentureGame.Instance.SmallFont,
                                TextColor = Color.Yellow,
                                HorizontalAlignment = HorizontalAlignment.Right,
                                VerticalAlignment = VerticalAlignment.Bottom
                            });
                        }
                        slotBtn.Content = btnLayout;

                        if (!isItemLocked)
                        {
                            int capturedIdx = idx;
                            var capturedItem = item;
                            slotBtn.Click += (s, e) => ShowSellItemConfirmationDialog(capturedIdx, capturedItem, fromBank: false);
                        }
                    }
                    else
                    {
                        slotBtn.Content = new Label
                        {
                            Text = "",
                            Font = VentureGame.Instance.SmallFont,
                            TextColor = Color.DimGray,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center
                        };
                    }

                    Grid.SetRow(slotBtn, ir);
                    Grid.SetColumn(slotBtn, ic);
                    sellInvGrid.Widgets.Add(slotBtn);
                }
                rightCol.Widgets.Add(sellInvGrid);
            }
            else // Bank
            {
                var bankItems = new List<Tuple<ItemData, int>>();
                if (charState?.Bank != null)
                {
                    for (int i = 0; i < charState.Bank.Count; i++)
                    {
                        var item = charState.Bank[i];
                        if (item != null)
                        {
                            bankItems.Add(new Tuple<ItemData, int>(item, i));
                        }
                    }
                }

                // Sort bank items alphabetically
                bankItems.Sort((a, b) => a.Item1.Name.CompareTo(b.Item1.Name));

                if (bankItems.Count == 0)
                {
                    rightCol.Widgets.Add(new Label
                    {
                        Text = "Your bank is empty.",
                        Font = VentureGame.Instance.SmallFont,
                        TextColor = Color.DimGray
                    });
                }
                else
                {
                    var sellBankGrid = new Grid { RowSpacing = 6, ColumnSpacing = 6 };
                    for (int i = 0; i < 5; i++) sellBankGrid.ColumnsProportions.Add(new Proportion(ProportionType.Part, 1f));

                    int br = 0, bc = 0;
                    foreach (var tuple in bankItems)
                    {
                        var item = tuple.Item1;
                        int originalIndex = tuple.Item2;

                        var slotBtn = new Button
                        {
                            Width = 60,
                            Height = 60,
                            Padding = new Thickness(2),
                            Background = new SolidBrush(GetRarityBgColor(item.Rarity)),
                            BorderThickness = new Thickness(1),
                            Border = new SolidBrush(GetRarityBorderColor(item.Rarity))
                        };

                        var btnLayout = new Panel();
                        btnLayout.Widgets.Add(new Label
                        {
                            Text = item.Icon ?? "❓",
                            Font = VentureGame.Instance.MainFont,
                            TextColor = Color.White,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            VerticalAlignment = VerticalAlignment.Center
                        });

                        if ((item.Quantity ?? 1) > 1)
                        {
                            btnLayout.Widgets.Add(new Label
                            {
                                Text = item.Quantity.ToString(),
                                Font = VentureGame.Instance.SmallFont,
                                TextColor = Color.Yellow,
                                HorizontalAlignment = HorizontalAlignment.Right,
                                VerticalAlignment = VerticalAlignment.Bottom
                            });
                        }
                        slotBtn.Content = btnLayout;

                        var capturedItem = item;
                        slotBtn.Click += (s, e) => ShowSellItemConfirmationDialog(originalIndex, capturedItem, fromBank: true);

                        Grid.SetRow(slotBtn, br);
                        Grid.SetColumn(slotBtn, bc);
                        sellBankGrid.Widgets.Add(slotBtn);

                        bc++;
                        if (bc >= 5)
                        {
                            bc = 0;
                            br++;
                        }
                    }
                    rightCol.Widgets.Add(sellBankGrid);
                }
            }

            return layout;
        }

        private void ShowBuyConfirmationDialog(ItemData item, bool isPermanent, int index = -1)
        {
            var dialog = new Dialog
            {
                Title = "Confirm Purchase",
                Width = 320,
                Height = 220
            };

            var content = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(12) };

            content.Widgets.Add(new Label
            {
                Text = $"{item.Icon ?? "❓"} {item.Name}",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center
            });

            if (!string.IsNullOrEmpty(item.Description))
            {
                content.Widgets.Add(new Label
                {
                    Text = item.Description,
                    Font = VentureGame.Instance.SmallFont,
                    TextColor = Color.LightGray,
                    Wrap = true
                });
            }

            content.Widgets.Add(new Label
            {
                Text = $"Cost: 💰 {item.Price}g",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.Yellow,
                HorizontalAlignment = HorizontalAlignment.Center
            });

            var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };

            var btnBuy = MyraExtensions.CreateButton("Buy", VentureGame.Instance.SmallFont);
            btnBuy.Background = new SolidBrush(new Color(50, 140, 60));
            btnBuy.Click += async (s, e) =>
            {
                string identifier = isPermanent ? item.Name : index.ToString();
                await VentureGame.Instance.Network.EmitPlayerAction("buyItem", new { identifier = identifier, isPermanent = isPermanent });
                dialog.Close();
            };
            btnRow.Widgets.Add(btnBuy);

            var btnCancel = MyraExtensions.CreateButton("Cancel", VentureGame.Instance.SmallFont);
            btnCancel.Background = new SolidBrush(new Color(180, 50, 50));
            btnCancel.Click += (s, e) => dialog.Close();
            btnRow.Widgets.Add(btnCancel);

            content.Widgets.Add(btnRow);
            dialog.Content = content;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void ShowSellAllJunkDialog(List<Tuple<ItemData, int>> junkItems, int totalValue)
        {
            var dialog = new Dialog
            {
                Title = "Sell All Junk",
                Width = 300,
                Height = 180
            };

            var content = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };

            content.Widgets.Add(new Label
            {
                Text = $"Sell {junkItems.Count} common T1 materials for 💰 {totalValue}g?",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.White,
                Wrap = true
            });

            var uniqueNames = new List<string>();
            foreach (var tuple in junkItems)
            {
                if (!uniqueNames.Contains(tuple.Item1.Name)) uniqueNames.Add(tuple.Item1.Name);
            }
            string listText = "Items: " + string.Join(", ", uniqueNames);
            if (listText.Length > 100) listText = listText.Substring(0, 97) + "...";

            content.Widgets.Add(new Label
            {
                Text = listText,
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.DimGray,
                Wrap = true
            });

            var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };

            var btnConfirm = MyraExtensions.CreateButton("Sell All", VentureGame.Instance.SmallFont);
            btnConfirm.Background = new SolidBrush(new Color(50, 140, 60));
            btnConfirm.Click += async (s, e) =>
            {
                await VentureGame.Instance.Network.EmitPlayerAction("sellAllJunk");
                dialog.Close();
            };
            btnRow.Widgets.Add(btnConfirm);

            var btnCancel = MyraExtensions.CreateButton("Cancel", VentureGame.Instance.SmallFont);
            btnCancel.Background = new SolidBrush(new Color(180, 50, 50));
            btnCancel.Click += (s, e) => dialog.Close();
            btnRow.Widgets.Add(btnCancel);

            content.Widgets.Add(btnRow);
            dialog.Content = content;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }

        private void ShowSellItemConfirmationDialog(int itemIndex, ItemData item, bool fromBank)
        {
            int sellPrice = Math.Max(1, (int)Math.Floor(item.Price / 2.0));
            int maxQuantity = item.Quantity ?? 1;

            var dialog = new Dialog
            {
                Title = "Confirm Sell",
                Width = 320,
                Height = maxQuantity > 1 ? 220 : 160
            };

            var content = new VerticalStackPanel { Spacing = 10, Padding = new Thickness(10) };

            content.Widgets.Add(new Label
            {
                Text = $"{item.Icon ?? "❓"} {item.Name}",
                Font = VentureGame.Instance.MainFont,
                TextColor = Color.White,
                HorizontalAlignment = HorizontalAlignment.Center
            });

            var confirmLabel = new Label
            {
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.LightGray,
                HorizontalAlignment = HorizontalAlignment.Center,
                Wrap = true
            };
            content.Widgets.Add(confirmLabel);

            HorizontalSlider slider = null;
            if (maxQuantity > 1)
            {
                slider = new HorizontalSlider
                {
                    Minimum = 1,
                    Maximum = maxQuantity,
                    Value = 1,
                    HorizontalAlignment = HorizontalAlignment.Stretch
                };

                slider.ValueChanged += (s2, e2) =>
                {
                    int qty = (int)slider.Value;
                    int totalGold = sellPrice * qty;
                    confirmLabel.Text = $"Sell {qty}x {item.Name} for 💰 {totalGold}g?";
                };
                content.Widgets.Add(slider);
                confirmLabel.Text = $"Sell 1x {item.Name} for 💰 {sellPrice}g?";
            }
            else
            {
                confirmLabel.Text = $"Sell 1x {item.Name} for 💰 {sellPrice}g?";
            }

            var locationLabel = new Label
            {
                Text = $"(From {(fromBank ? "Bank" : "Inventory")})",
                Font = VentureGame.Instance.SmallFont,
                TextColor = Color.DimGray,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            content.Widgets.Add(locationLabel);

            var btnRow = new HorizontalStackPanel { Spacing = 10, HorizontalAlignment = HorizontalAlignment.Center };

            var btnConfirm = MyraExtensions.CreateButton("Sell", VentureGame.Instance.SmallFont);
            btnConfirm.Background = new SolidBrush(new Color(50, 140, 60));
            btnConfirm.Click += async (s, e) =>
            {
                int quantityToSell = slider != null ? (int)slider.Value : 1;
                await VentureGame.Instance.Network.EmitPlayerAction("sellItem", new { itemIndex = itemIndex, fromBank = fromBank, quantity = quantityToSell });
                dialog.Close();
            };
            btnRow.Widgets.Add(btnConfirm);

            var btnCancel = MyraExtensions.CreateButton("Cancel", VentureGame.Instance.SmallFont);
            btnCancel.Background = new SolidBrush(new Color(180, 50, 50));
            btnCancel.Click += (s, e) => dialog.Close();
            btnRow.Widgets.Add(btnCancel);

            content.Widgets.Add(btnRow);
            dialog.Content = content;
            dialog.ShowModal(VentureGame.Instance.Desktop);
        }


        private void UpdateRestockTimerText()
        {
            if (_restockTimerLabel == null) return;
            var charState = VentureGame.Instance.CharacterState;
            if (charState == null || string.IsNullOrEmpty(charState.MerchantLastStocked))
            {
                _restockTimerLabel.Text = "Restock in: --:--";
                return;
            }

            if (long.TryParse(charState.MerchantLastStocked, out long lastStocked))
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                long timePassed = now - lastStocked;
                long timeRemaining = 600000 - timePassed; // 10 minutes

                if (timeRemaining <= 0)
                {
                    _restockTimerLabel.Text = "Restock in: 00:00 (Ready to restock)";
                }
                else
                {
                    long minutes = timeRemaining / 60000;
                    long seconds = (timeRemaining % 60000) / 1000;
                    _restockTimerLabel.Text = $"Restock in: {minutes:D2}:{seconds:D2}";
                }
            }
            else
            {
                _restockTimerLabel.Text = "Restock in: --:--";
            }
        }

        public void Update(GameTime gameTime)
        {
            if (_currentTab == "merchant" && _restockTimerLabel != null)
            {
                _timerElapsedMs += gameTime.ElapsedGameTime.TotalMilliseconds;
                if (_timerElapsedMs >= 1000)
                {
                    _timerElapsedMs = 0;
                    UpdateRestockTimerText();
                }
            }
        }

        private Color GetRarityBorderColor(string rarity)
        {
            if (string.IsNullOrEmpty(rarity)) return new Color(70, 80, 100);
            return rarity.ToLowerInvariant() switch
            {
                "uncommon" => new Color(46, 204, 113),
                "rare" => new Color(52, 152, 219),
                "epic" => new Color(155, 89, 182),
                "legendary" => new Color(241, 196, 15),
                _ => new Color(70, 80, 100)
            };
        }

        private Color GetRarityBgColor(string rarity)
        {
            if (string.IsNullOrEmpty(rarity)) return new Color(30, 35, 45);
            return rarity.ToLowerInvariant() switch
            {
                "uncommon" => new Color(20, 40, 25),
                "rare" => new Color(20, 35, 50),
                "epic" => new Color(35, 20, 45),
                "legendary" => new Color(45, 35, 20),
                _ => new Color(30, 35, 45)
            };
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
