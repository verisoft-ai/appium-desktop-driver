import javax.accessibility.*;
import javax.swing.*;
import java.awt.*;

public class TestForm extends JFrame {
    public TestForm() {
        setTitle("Test Form");
        setDefaultCloseOperation(EXIT_ON_CLOSE);
        setSize(400, 350);
        setLayout(new GridLayout(0, 2, 10, 10));

        add(new JLabel("First Name:"));
        JTextField firstName = new JTextField();
        firstName.getAccessibleContext().setAccessibleName("firstName");
        add(firstName);

        add(new JLabel("Last Name:"));
        JTextField lastName = new JTextField();
        lastName.getAccessibleContext().setAccessibleName("lastName");
        add(lastName);

        add(new JLabel("Email:"));
        JTextField email = new JTextField();
        email.getAccessibleContext().setAccessibleName("email");
        add(email);

        add(new JLabel("Country:"));
        JComboBox<String> country = new JComboBox<>(new String[]{"USA", "UK", "Other"});
        country.getAccessibleContext().setAccessibleName("country");
        add(country);

        add(new JLabel("Department:"));
        // ExpandCollapse pattern intentionally disabled — list items must be selected
        // by finding virtual children in the open popup (no expand command support).
        JComboBox<String> department = new JComboBox<String>(
                new String[]{"Engineering", "HR", "Finance", "Marketing"}) {
            @Override
            public AccessibleContext getAccessibleContext() {
                if (accessibleContext == null) {
                    accessibleContext = new AccessibleJComboBox() {
                        @Override
                        public AccessibleStateSet getAccessibleStateSet() {
                            AccessibleStateSet states = super.getAccessibleStateSet();
                            states.remove(AccessibleState.EXPANDABLE);
                            return states;
                        }
                        @Override
                        public AccessibleAction getAccessibleAction() {
                            return null;
                        }
                    };
                    accessibleContext.setAccessibleName("department");
                }
                return accessibleContext;
            }
        };
        add(department);

        add(new JLabel("Broken Field:"));
        // Regression fixture: simulates a 3rd-party component whose AccessibleContext
        // throws when the tree walker asks for its children (as some real Swing L&F /
        // custom renderers do). A broad traversal (getPageSource, XPath //* scans,
        // tag-name searches) must skip this node and still find everything else —
        // it must NOT blow up the whole find/getChildren call with an unguarded NPE.
        JPanel brokenField = new JPanel() {
            @Override
            public AccessibleContext getAccessibleContext() {
                if (accessibleContext == null) {
                    accessibleContext = new AccessibleJPanel() {
                        @Override
                        public int getAccessibleChildrenCount() {
                            throw new NullPointerException("simulated broken AccessibleContext (regression fixture)");
                        }
                    };
                    accessibleContext.setAccessibleName("brokenField");
                }
                return accessibleContext;
            }
        };
        add(brokenField);

        JCheckBox agree = new JCheckBox("I agree");
        agree.getAccessibleContext().setAccessibleName("agreeCheckbox");
        add(agree);

        JButton submit = new JButton("Submit");
        submit.getAccessibleContext().setAccessibleName("submitButton");
        add(submit);

        JButton showError = new JButton("Show Error");
        showError.getAccessibleContext().setAccessibleName("showErrorButton");
        showError.addActionListener(e ->
            SwingUtilities.invokeLater(() ->
                JOptionPane.showMessageDialog(TestForm.this, "אירעה שגיאה", "שגיאה", JOptionPane.ERROR_MESSAGE)
            )
        );
        add(showError);

        JButton showUntitled = new JButton("Show Untitled Dialog");
        showUntitled.getAccessibleContext().setAccessibleName("showUntitledDialogButton");
        showUntitled.addActionListener(e -> SwingUtilities.invokeLater(() -> {
            JDialog dialog = new JDialog(TestForm.this, "", true);
            dialog.setSize(250, 120);
            dialog.setLocationRelativeTo(TestForm.this);
            JButton closeBtn = new JButton("Close");
            closeBtn.getAccessibleContext().setAccessibleName("closeUntitledDialog");
            closeBtn.addActionListener(ev -> dialog.dispose());
            dialog.setLayout(new FlowLayout());
            dialog.add(new JLabel("Untitled dialog content"));
            dialog.add(closeBtn);
            dialog.setVisible(true);
        }));
        add(showUntitled);
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> new TestForm().setVisible(true));
    }
}
