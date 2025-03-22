package telegram

import (
	"testing"
)

func TestMessageQueue(t *testing.T) {
	t.Run("Add and Get messages", func(t *testing.T) {
		q := NewMessageQueue(3)
		msg1 := ChatMessage{Type: TextType, From: ChatFromUser, Message: "test1"}
		msg2 := ChatMessage{Type: TextType, From: ChatFromUser, Message: "test2"}

		q.Add(msg1)
		q.Add(msg2)

		messages := q.Get()
		if len(messages) != 2 {
			t.Errorf("Expected 2 messages, got %d", len(messages))
		}
	})

	t.Run("Queue size limit", func(t *testing.T) {
		q := NewMessageQueue(2)
		msg1 := ChatMessage{Type: TextType, From: ChatFromUser, Message: "test1"}
		msg2 := ChatMessage{Type: TextType, From: ChatFromUser, Message: "test2"}
		msg3 := ChatMessage{Type: TextType, From: ChatFromUser, Message: "test3"}

		q.Add(msg1)
		q.Add(msg2)
		q.Add(msg3)

		messages := q.Get()
		if len(messages) != 2 {
			t.Errorf("Expected 2 messages after overflow, got %d", len(messages))
		}
		if messages[0].Message != "test2" {
			t.Errorf("Expected first message to be 'test2', got '%s'", messages[0].Message)
		}
	})

	t.Run("GetLatest message", func(t *testing.T) {
		q := NewMessageQueue(3)
		msg1 := ChatMessage{FromID: 1, Message: "test1"}
		msg2 := ChatMessage{FromID: 2, Message: "test2"}
		msg3 := ChatMessage{FromID: 1, Message: "test3"}

		q.Add(msg1)
		q.Add(msg2)
		q.Add(msg3)

		latest := q.GetLatest(1)
		if latest.Message != "test3" {
			t.Errorf("Expected latest message to be 'test3', got '%s'", latest.Message)
		}
	})

	t.Run("GetLatestByType message", func(t *testing.T) {
		q := NewMessageQueue(3)
		msg1 := ChatMessage{FromID: 1, From: ChatFromUser, Message: "test1"}
		msg2 := ChatMessage{FromID: 1, From: ChatFromBot, Message: "test2"}
		msg3 := ChatMessage{FromID: 1, From: ChatFromUser, Message: "test3"}

		q.Add(msg1)
		q.Add(msg2)
		q.Add(msg3)

		latest := q.GetLatestByType(ChatFromUser)
		if latest.Message != "test3" {
			t.Errorf("Expected latest user message to be 'test3', got '%s'", latest.Message)
		}
	})

	t.Run("Concurrent access", func(t *testing.T) {
		q := NewMessageQueue(100)
		done := make(chan bool)

		for i := 0; i < 100; i++ {
			go func(i int) {
				q.Add(ChatMessage{Message: string(rune(i))})
				done <- true
			}(i)
		}

		for i := 0; i < 100; i++ {
			<-done
		}

		messages := q.Get()
		if len(messages) != 100 {
			t.Errorf("Expected 100 messages, got %d", len(messages))
		}
	})
}

func TestChatHistory(t *testing.T) {
	t.Run("Get new chat history", func(t *testing.T) {
		chatID := int64(123)
		history := GetChatHistory(chatID)

		if history.ChatID != chatID {
			t.Errorf("Expected chat ID %d, got %d", chatID, history.ChatID)
		}

		if len(history.Messages.Get()) != 0 {
			t.Error("New chat history should be empty")
		}
	})

	t.Run("Get existing chat history", func(t *testing.T) {
		chatID := int64(456)
		history1 := GetChatHistory(chatID)
		history1.Messages.Add(ChatMessage{Message: "test"})

		history2 := GetChatHistory(chatID)
		if len(history2.Messages.Get()) != 1 {
			t.Error("Should retrieve existing chat history")
		}
	})

	t.Run("Add and retrieve message", func(t *testing.T) {
		chatID := int64(789)
		AddMessage(chatID, ChatFromUser, TextType, 1, "test message")

		history := GetChatHistory(chatID)
		messages := history.Messages.Get()
		if len(messages) != 1 {
			t.Fatal("Expected 1 message")
		}
		if messages[0].Message != "test message" {
			t.Errorf("Expected message 'test message', got '%s'", messages[0].Message)
		}
	})

	t.Run("GetLatestMessage", func(t *testing.T) {
		chatID := int64(999)
		AddMessage(chatID, ChatFromUser, TextType, chatID, "first")
		AddMessage(chatID, ChatFromBot, TextType, 0, "second")

		msg := GetLatestMessage(chatID, ChatFromBot)
		if msg.Message != "second" {
			t.Errorf("Expected latest bot message to be 'second', got '%s'", msg.Message)
		}
	})
}
