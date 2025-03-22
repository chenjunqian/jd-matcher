package telegram

import (
	"sync"
	"time"
)

type ChatFrom string
type MessageType string

const (
	ChatFromUser ChatFrom = "user"
	ChatFromBot  ChatFrom = "bot"

	CommandType  MessageType = "command"
	TextType     MessageType = "text"
	DocumentType MessageType = "document"
)

type ChatHistory struct {
	ChatID   int64
	Messages *MessageQueue
}

type ChatMessage struct {
	Type    MessageType
	From    ChatFrom
	FromID  int64
	Message string
	Time    time.Time
}

type MessageQueue struct {
	mu    sync.Mutex
	items []ChatMessage
	max   int
}

var (
	ChatHistoryMap = make(map[int64]*ChatHistory)
)

func GetChatHistory(chatID int64) *ChatHistory {
	if chatHistory, ok := ChatHistoryMap[chatID]; ok {
		return chatHistory
	}
	chatHistory := &ChatHistory{
		ChatID:   chatID,
		Messages: NewMessageQueue(20),
	}
	ChatHistoryMap[chatID] = chatHistory
	return chatHistory
}

func GetLatestMessage(fromId int64, fromType ChatFrom) ChatMessage {
	chatHistory := GetChatHistory(fromId)
	return chatHistory.Messages.GetLatestByType(fromType)
}

func AddMessage(chatID int64, from ChatFrom, messageType MessageType, fromID int64, message string) {
	chatHistory := GetChatHistory(chatID)
	newChatMessage := ChatMessage{
		Type:    messageType,
		From:    from,
		FromID:  fromID,
		Message: message,
		Time:    time.Now(),
	}
	chatHistory.Messages.Add(newChatMessage)
}

func NewMessageQueue(maxSize int) *MessageQueue {
	return &MessageQueue{
		items: make([]ChatMessage, 0, maxSize),
		max:   maxSize,
	}
}

func (q *MessageQueue) Add(message ChatMessage) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.items) == q.max {
		// Remove oldest item
		q.items = q.items[1:]
	}
	q.items = append(q.items, message)
}

func (q *MessageQueue) Get() []ChatMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	// Return a copy of the items to prevent external modification
	items := make([]ChatMessage, len(q.items))
	copy(items, q.items)
	return items
}

func (q *MessageQueue) GetLatest(fromId int64) ChatMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := len(q.items) - 1; i >= 0; i-- {
		if q.items[i].FromID == fromId {
			return q.items[i]
		}
	}
	return ChatMessage{}
}

func (q *MessageQueue) GetLatestByType(fromType ChatFrom) ChatMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	for i := len(q.items) - 1; i >= 0; i-- {
		if q.items[i].From == fromType {
			return q.items[i]
		}
	}
	return ChatMessage{}
}